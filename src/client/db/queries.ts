// Read-side queries. Each is one Dexie read, so `useLive` re-renders when the underlying data changes.
import { normaliseRules } from '../../shared/grant.ts';
import type { Expense, Grant, GrantDocument, InboxItem, Trip } from '../../shared/types.ts';
import { db } from './index.ts';

const withRules = (g: Grant): Grant => ({ ...g, rules: normaliseRules(g.rules) });

async function expensesOfGrant(grantId: string): Promise<{ trips: Trip[]; expenses: Expense[] }> {
  const trips = await db.trips.where('grantId').equals(grantId).toArray();
  const expenses = trips.length ? await db.expenses.where('tripId').anyOf(trips.map((t) => t.id)).toArray() : [];
  return { trips, expenses };
}

export const queries = {
  async grantsOverview(): Promise<{ grant: Grant; tripCount: number; expenses: Expense[] }[]> {
    const grants = await db.grants.orderBy('updatedAt').reverse().toArray();
    return Promise.all(
      grants.map(async (g) => {
        const { trips, expenses } = await expensesOfGrant(g.id);
        return { grant: withRules(g), tripCount: trips.length, expenses };
      }),
    );
  },

  async grantDetail(id: string): Promise<{ grant: Grant; trips: { trip: Trip; expenses: Expense[] }[]; expenses: Expense[]; docs: GrantDocument[] } | null> {
    const grant = await db.grants.get(id);
    if (!grant) return null;
    const { trips, expenses } = await expensesOfGrant(id);
    return {
      grant: withRules(grant),
      trips: trips.map((trip) => ({ trip, expenses: expenses.filter((e) => e.tripId === trip.id) })),
      expenses,
      docs: await db.grantDocs.where('grantId').equals(id).toArray(),
    };
  },

  async tripDetail(id: string): Promise<{ trip: Trip; grant: Grant; expenses: Expense[]; grantExpenses: Expense[] } | null> {
    const trip = await db.trips.get(id);
    const grant = trip && (await db.grants.get(trip.grantId));
    if (!trip || !grant) return null;
    const { expenses: grantExpenses } = await expensesOfGrant(grant.id);
    return { trip, grant: withRules(grant), expenses: grantExpenses.filter((e) => e.tripId === id), grantExpenses };
  },

  async expenseDetail(id: string): Promise<{ expense: Expense; trip: Trip; grant: Grant } | null> {
    const expense = await db.expenses.get(id);
    const trip = expense && (await db.trips.get(expense.tripId));
    const grant = trip && (await db.grants.get(trip.grantId));
    return expense && trip && grant ? { expense, trip, grant: withRules(grant) } : null;
  },

  /** Every trip with its grant's name, for the "which trip?" selects. */
  async tripChoices(): Promise<{ trip: Trip; grant: Grant }[]> {
    const [trips, grants] = await Promise.all([db.trips.toArray(), db.grants.toArray()]);
    const byId = new Map(grants.map((g) => [g.id, g]));
    return trips.flatMap((trip) => {
      const grant = byId.get(trip.grantId);
      return grant ? [{ trip, grant }] : [];
    });
  },

  async inboxList(): Promise<InboxItem[]> {
    return (await db.inbox.orderBy('receivedAt').toArray()).reverse();
  },
  inboxItem: (id: string): Promise<InboxItem | undefined> => db.inbox.get(id),
  inboxCount: (): Promise<number> => db.inbox.count(),
  async grantCount(): Promise<number> {
    return db.grants.count();
  },
};
