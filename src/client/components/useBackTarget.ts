// REQ-NFR-09: where "Back" goes from a screen that is not tied to one trip (Expenses with proof, Settings): the trip the
// user last worked on, else the list of grants.
import { db, repo } from '../db/index.ts';
import { useLive } from '../lib/useLive.ts';

export function useBackTarget(): { to: string; label: string } {
  const trip = useLive(async () => {
    const id = await repo.lastTripId();
    return (id && (await db.trips.get(id))) || null;
  });
  return trip ? { to: `/trips/${trip.id}`, label: trip.name } : { to: '/grants', label: 'grants' };
}
