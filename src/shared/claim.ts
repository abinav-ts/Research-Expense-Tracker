// REQ-CLM-01, REQ-CLM-04, REQ-CLM-08, REQ-PRIV-02, REQ-REV-02/03: the one shape of a submitted claim. The device builds it,
// the preview and the PDF draw it, the server checks it and the reviewer reads it. Pure (zod only).
import { z } from 'zod';
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId, type ClaimDraft, type Expense, type Flag } from './types.ts';

export const CLAIM_LIMITS = {
  fileBytes: 1_000_000,
  files: 40,
  totalBytes: 25_000_000,
  items: 200,
  itemComment: 1000,
  overallComment: 2000,
} as const;

/** Wording of the declaration until the grant authority supplies its own (D-4). */
export const DECLARATION_TEXT =
  'I declare that the expenses listed are true and were incurred for the conference above, that the amounts are those debited to my account, and that I have not claimed them elsewhere.';

export const CLAIM_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'] as const;

const minor = z.number().int().min(0).max(9_999_999_999_999);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

const flagSchema = z.object({
  ruleId: z.string().min(1).max(60),
  severity: z.enum(['info', 'warn', 'error']),
  message: z.string().min(1).max(500),
});

const statementSchema = z.object({
  date: day,
  narration: z.string().max(300),
  debitMinor: minor,
  refNo: z.string().max(100).optional(),
  rowHash: z.string().min(1).max(64),
});

const fileSchema = z.object({
  id,
  name: text(200),
  mime: z.enum(CLAIM_FILE_TYPES),
  kind: z.enum(['proof', 'supporting_doc', 'grant_doc']),
  proofType: z.enum(['upi_screenshot', 'card_alert', 'invoice', 'ticket', 'other']).optional(),
});

const itemSchema = z.object({
  id,
  date: day,
  description: text(200),
  categoryId: z.enum(CATEGORY_IDS).optional(),
  amountMinor: minor,
  originalMinor: minor,
  originalCurrency: z.string().regex(/^[A-Z]{3}$/),
  paymentMode: z.enum(['bank', 'cash']),
  reference: z.string().max(100).optional(),
  statementRef: statementSchema.optional(),
  justification: z.string().max(500).optional(),
  fileIds: z.array(id).max(CLAIM_LIMITS.files),
  /** Proofs that were left out (too large). Shown to the reviewer as "proof not included". */
  missingProofs: z.number().int().min(0).max(100).default(0),
  flags: z.array(flagSchema).max(20),
});

const claimantSchema = z.object({
  name: text(120),
  email: z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'not an email address'),
  employeeId: z.string().trim().max(60).optional(),
});

const positionSchema = z.object({
  sanctionedMinor: minor,
  usedBeforeMinor: minor,
  otherTripsMinor: minor,
  thisClaimMinor: minor,
  leftMinor: z.number().int().min(-9_999_999_999_999).max(9_999_999_999_999),
});

export const claimPayloadSchema = z
  .object({
    /** Makes a repeated Submit the same claim (REQ-CLM-04, REQ-OFF-04). */
    idempotencyKey: id.min(16),
    preparedAt: z.string().max(40),
    claimant: claimantSchema,
    declaration: text(1000),
    grant: z.object({ name: text(200), sponsor: z.string().trim().max(200), startDate: day, endDate: day }),
    trip: z.object({ name: text(200), city: z.string().trim().max(100), country: z.string().trim().max(100), startDate: day, endDate: day }),
    position: positionSchema,
    items: z.array(itemSchema).min(1).max(CLAIM_LIMITS.items),
    files: z.array(fileSchema).max(CLAIM_LIMITS.files),
  })
  .superRefine((p, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    const itemIds = new Set(p.items.map((i) => i.id));
    if (itemIds.size !== p.items.length) bad('duplicate item id');
    const fileIds = new Set(p.files.map((f) => f.id));
    if (fileIds.size !== p.files.length) bad('duplicate file id');
    for (const i of p.items) for (const f of i.fileIds) if (!fileIds.has(f)) bad('item refers to an unknown file');
    const used = new Set(p.items.flatMap((i) => i.fileIds));
    for (const f of p.files) if (f.kind !== 'grant_doc' && !used.has(f.id)) bad('file belongs to no item');
    const total = p.items.reduce((s, i) => s + i.amountMinor, 0);
    if (p.position.thisClaimMinor !== total) bad('claim total does not equal the sum of the items');
    const left = p.position.sanctionedMinor - p.position.usedBeforeMinor - p.position.otherTripsMinor - p.position.thisClaimMinor;
    if (p.position.leftMinor !== left) bad('amount left does not add up');
    for (const i of p.items) {
      if (i.flags.some((f) => f.severity === 'error')) bad('a claim with error flags cannot be submitted');
      if (i.paymentMode === 'bank' && !i.statementRef) bad('a bank-paid item needs its statement line');
      if (i.statementRef && i.statementRef.debitMinor !== i.amountMinor) bad('claimed amount differs from the statement debit');
    }
  });

export type ClaimPayload = z.infer<typeof claimPayloadSchema>;
export type ClaimPayloadItem = ClaimPayload['items'][number];
export type ClaimPayloadFile = ClaimPayload['files'][number];

/** One file ready to send, as the device holds it. */
export interface PreparedFile {
  meta: ClaimPayloadFile;
  bytes: Blob;
}

export interface BuildClaimInput {
  draft: ClaimDraft;
  /** Flags for this trip from the rules engine. */
  flags: Flag[];
  /** Every expense of every trip of the grant (the grant position needs the other trips). */
  grantExpenses: Expense[];
  claimant: { name: string; email: string; employeeId?: string };
  idempotencyKey: string;
  preparedAt: string;
  /** Files that could be sent, by the attachment id they came from. */
  files: PreparedFile[];
  /** Attachment ids that were left out (too large), so the reviewer is told. */
  skippedAttachmentIds: string[];
  declaration?: string;
}

/** Builds exactly what the reviewer will see (REQ-PRIV-03: the preview and the request are made from this one value). */
export function buildClaimPayload(input: BuildClaimInput): ClaimPayload {
  const { draft, flags, grantExpenses, files } = input;
  const sent = new Map(files.map((f) => [f.meta.id, f.meta]));
  const skipped = new Set(input.skippedAttachmentIds);
  const items: ClaimPayloadItem[] = draft.items.map((item) => ({
    id: item.id,
    date: item.date,
    description: item.description,
    ...(item.categoryId && { categoryId: item.categoryId }),
    amountMinor: item.amountMinor,
    originalMinor: item.originalMinor,
    originalCurrency: item.originalCurrency,
    paymentMode: item.paymentMode,
    ...(item.reference && { reference: item.reference }),
    ...(item.statementRef && { statementRef: pickStatement(item.statementRef) }),
    ...(item.justification && { justification: item.justification }),
    fileIds: item.attachmentIds.filter((a) => sent.has(a)),
    missingProofs: item.attachmentIds.filter((a) => skipped.has(a)).length,
    flags: flags.filter((f) => f.itemId === item.id).map(({ ruleId, severity, message }) => ({ ruleId, severity, message })),
  }));
  const thisClaimMinor = items.reduce((s, i) => s + i.amountMinor, 0);
  const grant = draft.grant;
  const otherTripsMinor = grantExpenses.filter((e) => e.tripId !== draft.trip.id && !e.excluded).reduce((s, e) => s + e.inrMinor, 0);
  return {
    idempotencyKey: input.idempotencyKey,
    preparedAt: input.preparedAt,
    claimant: { name: input.claimant.name.trim(), email: input.claimant.email.trim(), ...(input.claimant.employeeId?.trim() && { employeeId: input.claimant.employeeId.trim() }) },
    declaration: input.declaration ?? DECLARATION_TEXT,
    grant: { name: grant.name, sponsor: grant.sponsor, startDate: grant.startDate, endDate: grant.endDate },
    trip: { name: draft.trip.name, city: draft.trip.city, country: draft.trip.country, startDate: draft.trip.startDate, endDate: draft.trip.endDate },
    position: {
      sanctionedMinor: grant.totalMinor,
      usedBeforeMinor: grant.utilisedBeforeMinor,
      otherTripsMinor,
      thisClaimMinor,
      leftMinor: grant.totalMinor - grant.utilisedBeforeMinor - otherTripsMinor - thisClaimMinor,
    },
    items,
    files: files.map((f) => f.meta),
  };
}

/** The only statement fields that are ever sent (REQ-PRIV-02). */
function pickStatement(s: { date: string; narration: string; debitMinor: number; refNo?: string; rowHash: string }) {
  return { date: s.date, narration: s.narration, debitMinor: s.debitMinor, ...(s.refNo && { refNo: s.refNo }), rowHash: s.rowHash };
}

/** Per-category totals in a fixed order (category list order, then "No category"). Adds up to the claim total. */
export function categoryTotals(items: Pick<ClaimPayloadItem, 'categoryId' | 'amountMinor'>[]): { categoryId: CategoryId | null; label: string; count: number; totalMinor: number }[] {
  const out = new Map<CategoryId | null, { count: number; totalMinor: number }>();
  for (const i of items) {
    const key = i.categoryId ?? null;
    const cur = out.get(key) ?? { count: 0, totalMinor: 0 };
    out.set(key, { count: cur.count + 1, totalMinor: cur.totalMinor + i.amountMinor });
  }
  const order: (CategoryId | null)[] = [...CATEGORY_IDS, null];
  return order.filter((k) => out.has(k)).map((k) => ({ categoryId: k, label: k ? CATEGORY_LABELS[k] : 'No category', ...out.get(k)! }));
}

/** Errors that stop a claim being submitted, one entry per item, in claim order. */
export function blockingItems(draft: ClaimDraft, flags: Flag[]): { itemId: string; description: string; messages: string[] }[] {
  const byItem = new Map<string, string[]>();
  for (const f of flags) if (f.severity === 'error') byItem.set(f.itemId, [...(byItem.get(f.itemId) ?? []), f.message]);
  return draft.items.filter((i) => byItem.has(i.id)).map((i) => ({ itemId: i.id, description: i.description, messages: byItem.get(i.id)! }));
}

// ---- Review ------------------------------------------------------------------------------------------------------

export type Decision = 'approve' | 'reject' | 'query';
export const DECISION_LABELS: Record<Decision, string> = { approve: 'Approved', reject: 'Rejected', query: 'Query' };
export type ClaimStatus = 'submitted' | 'in_review' | 'approved' | 'partially_approved' | 'rejected';
export const STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  approved: 'Approved',
  partially_approved: 'Partially approved',
  rejected: 'Rejected',
};

export interface ItemReview {
  itemId: string;
  decision: Decision;
  comment: string;
}

/** What the overall decision would be, or why it cannot be given yet (REQ-REV-03). */
export function outcomeOf(itemIds: string[], reviews: Pick<ItemReview, 'itemId' | 'decision'>[]): { ok: true; status: 'approved' | 'partially_approved' | 'rejected' } | { ok: false; undecided: string[] } {
  const by = new Map(reviews.map((r) => [r.itemId, r.decision]));
  const undecided = itemIds.filter((i) => {
    const d = by.get(i);
    return d !== 'approve' && d !== 'reject';
  });
  if (undecided.length) return { ok: false, undecided };
  const approved = itemIds.filter((i) => by.get(i) === 'approve').length;
  return { ok: true, status: approved === itemIds.length ? 'approved' : approved === 0 ? 'rejected' : 'partially_approved' };
}

/** REQ-REV-05: approved / rejected / still open, recomputed from the decisions. */
export function reviewTotals(items: Pick<ClaimPayloadItem, 'id' | 'amountMinor'>[], reviews: Pick<ItemReview, 'itemId' | 'decision'>[]): { approvedMinor: number; rejectedMinor: number; openMinor: number } {
  const by = new Map(reviews.map((r) => [r.itemId, r.decision]));
  const t = { approvedMinor: 0, rejectedMinor: 0, openMinor: 0 };
  for (const i of items) {
    const d = by.get(i.id);
    if (d === 'approve') t.approvedMinor += i.amountMinor;
    else if (d === 'reject') t.rejectedMinor += i.amountMinor;
    else t.openMinor += i.amountMinor;
  }
  return t;
}

/** What the reviewer and the owner's status page receive. */
export interface ClaimView {
  status: ClaimStatus;
  submittedAt: string;
  decidedAt?: string;
  overallComment?: string;
  payload: ClaimPayload;
  reviews: ItemReview[];
  /** True for the public sample claim: finishing it resets it. */
  sample?: boolean;
}

export const itemReviewBodySchema = z.object({
  decision: z.enum(['approve', 'reject', 'query']),
  comment: z.string().trim().max(CLAIM_LIMITS.itemComment).default(''),
});
export const finishBodySchema = z.object({ comment: z.string().trim().max(CLAIM_LIMITS.overallComment).default('') });

// ---- Tokens ------------------------------------------------------------------------------------------------------

/** 32 random bytes written URL-safe: 43 characters, 256 bits (REQ-REV-07). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** The one fixed, public link: the sample claim (REQ-DEMO-03). */
export const SAMPLE_TOKEN = 'sample';

export function isTokenShape(token: string): boolean {
  return token === SAMPLE_TOKEN || TOKEN_PATTERN.test(token);
}
