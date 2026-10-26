// REQ-RULE-01: the one pure function that checks a claim. No clock, no storage, no randomness; the draft is not changed.
// The same function runs on the client for live feedback and, later, on the server at submit (REQ-RULE-01).
import { formatInr } from '../money.ts';
import { dateWindowFlag } from './date-window.ts';
import { CATEGORY_LABELS, type ClaimDraft, type ClaimItem, type Flag } from '../types.ts';

export interface RuleContext {
  /** What the grant's other trips have already spent, so the balance left for this claim is known (REQ-RULE-04). */
  otherSpendMinor: number;
}

/** Short names for chips, by rule. The order here is the order flags are listed in for one item: what to fix first, first. */
export const RULE_LABELS: Record<string, string> = {
  DATE_OUT_OF_WINDOW: 'Date outside trip',
  UNCATEGORISED: 'Needs a category',
  CATEGORY_NOT_ELIGIBLE: 'Category not eligible',
  MISSING_PROOF: 'No proof attached',
  OVER_CATEGORY_CAP: 'Over category cap',
  FOREIGN_CURRENCY_NO_RATE: 'No exchange rate',
  UNVERIFIED_AMOUNT: 'Not yet verified',
  OVER_GRANT_BALANCE: 'Over grant balance',
  CASH_NOT_IN_STATEMENT: 'Paid in cash',
};
const RULE_ORDER = Object.keys(RULE_LABELS);

const label = (item: ClaimItem) => (item.categoryId ? CATEGORY_LABELS[item.categoryId] : 'This category');
const flag = (item: ClaimItem, ruleId: string, severity: Flag['severity'], message: string): Flag => ({ ruleId, severity, message, itemId: item.id });

export function evaluate(draft: ClaimDraft, context: RuleContext): Flag[] {
  const { grant, trip, items } = draft;
  const flags: Flag[] = [];
  const bufferDays = grant.rules.travelBufferDays;

  // Running totals, in item order: the flag goes on the one item that takes the total past the line.
  const spentInCategory = new Map<string, number>();
  const available = grant.totalMinor - grant.utilisedBeforeMinor - context.otherSpendMinor;
  let claimTotal = 0;
  let balanceCrossed = false;

  for (const item of items) {
    const rule = item.categoryId ? grant.rules.categories[item.categoryId] : undefined;

    const outside = dateWindowFlag(item, trip, bufferDays);
    if (outside) flags.push(outside);

    if (item.categoryId && rule) {
      const cap = rule.capPerTripMinor;
      const before = spentInCategory.get(item.categoryId) ?? 0;
      const after = before + item.amountMinor;
      spentInCategory.set(item.categoryId, after);
      if (cap !== undefined && before <= cap && after > cap) {
        flags.push(flag(item, 'OVER_CATEGORY_CAP', 'warn', `${label(item)} is ${formatInr(after - cap)} over its cap of ${formatInr(cap)} for this trip.`));
      }
      if (!rule.eligible) flags.push(flag(item, 'CATEGORY_NOT_ELIGIBLE', 'error', `${label(item)} is not an eligible category for this grant.`));
      if (rule.requiresProof && item.attachmentIds.length === 0) flags.push(flag(item, 'MISSING_PROOF', 'warn', `No proof is attached, and ${label(item)} needs one.`));
    } else {
      flags.push(flag(item, 'UNCATEGORISED', 'error', 'Choose a category for this expense.'));
    }

    claimTotal += item.amountMinor;
    if (!balanceCrossed && claimTotal > available) {
      balanceCrossed = true; // only the first item to take the claim past what is left carries the flag
      flags.push(flag(item, 'OVER_GRANT_BALANCE', 'error', `This takes the claim ${formatInr(claimTotal - available)} over what is left of the grant (${formatInr(Math.max(0, available))} available for this claim).`));
    }

    if (item.originalCurrency !== 'INR' && item.inrStatus === 'pending' && item.estimatedRateMicro === undefined) {
      flags.push(flag(item, 'FOREIGN_CURRENCY_NO_RATE', 'error', `This ${item.originalCurrency} amount has no estimated exchange rate, so its value in rupees is unknown.`));
    }

    if (item.paymentMode === 'bank' && item.inrStatus === 'pending') {
      flags.push(flag(item, 'UNVERIFIED_AMOUNT', 'error', 'Not yet matched to a bank statement debit. The grant authority accepts only the statement amount.'));
    }

    if (item.paymentMode === 'cash') {
      flags.push(flag(item, 'CASH_NOT_IN_STATEMENT', 'warn', item.justification
        ? `Paid in cash, so there is no statement line. Justified: “${item.justification}”`
        : 'Paid in cash, so there is no statement line. Add a justification.'));
    }
  }

  // Fixed order: by item (already in date order), then by rule.
  const position = new Map(items.map((item, i) => [item.id, i]));
  return flags.sort((a, b) => position.get(a.itemId)! - position.get(b.itemId)! || RULE_ORDER.indexOf(a.ruleId) - RULE_ORDER.indexOf(b.ruleId));
}

/** An error blocks submission until the item is fixed or removed; a warning never does (REQ-RULE-09). */
export const hasBlockingFlags = (flags: Flag[]): boolean => flags.some((f) => f.severity === 'error');

/** Flags per item id. */
export function flagsByItem(flags: Flag[]): Map<string, Flag[]> {
  const out = new Map<string, Flag[]>();
  for (const f of flags) out.set(f.itemId, [...(out.get(f.itemId) ?? []), f]);
  return out;
}
