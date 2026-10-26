// Domain model (SPEC §6). Money = integer minor units; dates = 'YYYY-MM-DD' strings; ids = UUID strings.

export const CATEGORY_IDS = [
  'registration',
  'airfare',
  'rail_bus',
  'local_transport',
  'accommodation',
  'meals',
  'visa_insurance',
  'other',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  registration: 'Registration',
  airfare: 'Airfare',
  rail_bus: 'Rail / bus',
  local_transport: 'Local transport',
  accommodation: 'Accommodation',
  meals: 'Meals',
  visa_insurance: 'Visa / insurance',
  other: 'Other',
};

export interface CategoryRule {
  eligible: boolean;
  capPerTripMinor?: number;
  requiresProof: boolean;
}
export interface GrantRules {
  travelBufferDays: number;
  categories: Record<CategoryId, CategoryRule>;
}

export interface Grant {
  id: string;
  name: string;
  sponsor: string;
  currency: 'INR';
  totalMinor: number;
  utilisedBeforeMinor: number;
  startDate: string;
  endDate: string;
  rules: GrantRules;
  createdAt: string;
  updatedAt: string;
}

export interface Trip {
  id: string;
  grantId: string;
  name: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  budgetMinor?: number;
  /** Default estimated INR per 1 unit of currency × 1,000,000. */
  fxRatesMicro?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

/** Stored only, never read or recognised (REQ-SET-07). */
export interface GrantDocument {
  id: string;
  grantId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  blobKey: string;
  includeInPack: boolean;
}

export type ProofType = 'upi_screenshot' | 'card_alert' | 'invoice' | 'ticket' | 'other';
export const PROOF_TYPE_LABELS: Record<ProofType, string> = {
  upi_screenshot: 'UPI screenshot',
  card_alert: 'Card alert',
  invoice: 'Invoice',
  ticket: 'Ticket',
  other: 'Other',
};

export interface Attachment {
  id: string;
  kind: 'proof' | 'supporting_doc';
  proofType?: ProofType;
  mime: string;
  name: string;
  sizeBytes: number;
  sha256: string;
  blobKey: string;
}

/** The only fields of a bank statement row that are ever kept or sent (SPEC §6, REQ-PRIV-02). */
export interface StatementRef {
  date: string;
  narration: string;
  debitMinor: number;
  refNo?: string;
  /** Fingerprint of the row, so the same row is never used twice. */
  rowHash: string;
}

export interface Expense {
  id: string;
  tripId: string;
  date: string;
  payee: string;
  categoryId?: CategoryId;
  note?: string;
  reference?: string;
  originalMinor: number;
  originalCurrency: string;
  inrMinor: number;
  inrStatus: 'pending' | 'confirmed';
  paymentMode: 'bank' | 'cash';
  estimatedRateMicro?: number;
  /** Set when matched to a statement row: inrMinor is then the statement debit and inrStatus 'confirmed'. */
  statementRef?: StatementRef;
  source: 'proof' | 'manual' | 'statement';
  attachments: Attachment[];
  /** Why a flagged item is fine (REQ-RULE-09), up to 500 characters. */
  justification?: string;
  excluded: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A shared proof awaiting confirmation: a file, or pasted/shared text (REQ-CAP-04). */
export interface InboxItem {
  id: string;
  kind: 'file' | 'text';
  receivedAt: string;
  proofType?: ProofType;
  // file items
  blobKey?: string;
  name?: string;
  mime?: string;
  sizeBytes?: number;
  sha256?: string;
  tooLarge?: boolean;
  // text items: already scrubbed of card digits and available-limit text (REQ-CAP-13)
  text?: string;
}

/** A rule-check result on one item (REQ-RULE-09): `error` blocks submission, `warn` never blocks, `info` is advisory. */
export interface Flag {
  ruleId: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  itemId: string;
}

/** One line of a claim (REQ-RULE-01). `amountMinor` is the statement debit when matched, otherwise the pending amount. */
export interface ClaimItem {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  originalMinor: number;
  originalCurrency: string;
  categoryId?: CategoryId;
  reference?: string;
  statementRef?: StatementRef;
  attachmentIds: string[];
  justification?: string;
  paymentMode: 'bank' | 'cash';
  inrStatus: 'pending' | 'confirmed';
  estimatedRateMicro?: number;
}

export interface ClaimDraft {
  grant: Grant;
  trip: Trip;
  items: ClaimItem[];
  grantDocIds: string[];
}
