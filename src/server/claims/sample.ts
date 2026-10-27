// REQ-DEMO-03: the public sample claim at /review/sample. Built in code from synthetic data, so it needs no database rows;
// the reviewer page keeps its decisions in the browser only, so visitors never affect each other.
import { claimPayloadSchema, DECLARATION_TEXT, type ClaimPayload, type ClaimView } from '../../shared/claim.ts';
import { SAMPLE_UPI_PNG_BASE64 } from './sample-assets.ts';

const text = (s: string) => new TextEncoder().encode(s);
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

interface SampleFile { mime: string; bytes: Uint8Array }
export const SAMPLE_FILES: Record<string, SampleFile> = {
  'f-upi': { mime: 'image/png', bytes: fromBase64(SAMPLE_UPI_PNG_BASE64) },
  'f-card': { mime: 'text/plain', bytes: text('INR 24,500.00 spent on card XXXX at HOTEL SAMPLE on 11-Nov-26. (SAMPLE message)') },
  'f-uber': { mime: 'text/plain', bytes: text('Uber trip receipt (SAMPLE). Fare Rs 640.00, 10 Nov 2026, 09:40 pm. Paid by UPI.') },
  'f-invoice': { mime: 'text/plain', bytes: text('Lisbon Computing Society (SAMPLE)\nConference registration\nTotal: EUR 180.00') },
};

const stmt = (date: string, narration: string, debitMinor: number, refNo: string, rowHash: string) => ({ date, narration, debitMinor, refNo, rowHash });

const payload: ClaimPayload = claimPayloadSchema.parse({
  idempotencyKey: 'sample-claim-0000000000',
  preparedAt: '2026-11-16T09:30:00.000Z',
  claimant: { name: 'Asha Sample', email: 'asha@example.org', employeeId: 'SAMPLE-001' },
  declaration: DECLARATION_TEXT,
  grant: { name: 'RSF Conference Grant', sponsor: 'Sample Agency', startDate: '2026-04-01', endDate: '2027-03-31' },
  trip: { name: 'ECM 2026', city: 'Lisbon', country: 'Portugal', startDate: '2026-11-10', endDate: '2026-11-14' },
  position: { sanctionedMinor: 10_000_000, usedBeforeMinor: 2_000_000, otherTripsMinor: 0, thisClaimMinor: 4_452_055, leftMinor: 10_000_000 - 2_000_000 - 4_452_055 },
  files: [
    { id: 'f-upi', name: 'upi-SMPL000000001.png', mime: 'image/png', kind: 'proof', proofType: 'upi_screenshot' },
    { id: 'f-uber', name: 'message.txt', mime: 'text/plain', kind: 'proof', proofType: 'invoice' },
    { id: 'f-card', name: 'message.txt', mime: 'text/plain', kind: 'proof', proofType: 'card_alert' },
    { id: 'f-invoice', name: 'invoice.txt', mime: 'text/plain', kind: 'proof', proofType: 'invoice' },
  ],
  items: [
    { id: 'i1', date: '2026-11-09', description: 'IRCTC', categoryId: 'rail_bus', amountMinor: 185_000, originalMinor: 185_000, originalCurrency: 'INR', paymentMode: 'bank', reference: 'SMPL000000001',
      statementRef: stmt('2026-11-09', 'UPI-IRCTC-SMPL000000001', 185_000, 'SMPL000000001', 'sample-1'), fileIds: ['f-upi'], missingProofs: 0, flags: [] },
    { id: 'i2', date: '2026-11-10', description: 'Uber', categoryId: 'local_transport', amountMinor: 64_000, originalMinor: 64_000, originalCurrency: 'INR', paymentMode: 'bank',
      statementRef: stmt('2026-11-10', 'UPI-UBER INDIA-SMPL000000002', 64_000, 'SMPL000000002', 'sample-2'), fileIds: ['f-uber'], missingProofs: 0, flags: [] },
    { id: 'i3', date: '2026-11-11', description: 'HOTEL SAMPLE', categoryId: 'accommodation', amountMinor: 2_450_000, originalMinor: 2_450_000, originalCurrency: 'INR', paymentMode: 'bank',
      statementRef: stmt('2026-11-12', 'POS HOTEL SAMPLE LISBON', 2_450_000, 'SMPL000000003', 'sample-3'), fileIds: ['f-card'], missingProofs: 0, flags: [] },
    { id: 'i4', date: '2026-11-12', description: 'Lisbon Computing Society', categoryId: 'registration', amountMinor: 1_723_055, originalMinor: 18_000, originalCurrency: 'EUR', paymentMode: 'bank',
      statementRef: stmt('2026-11-14', 'LISBON COMPUTING SOC INTL', 1_723_055, 'SMPL000000004', 'sample-4'), fileIds: ['f-invoice'], missingProofs: 0, flags: [] },
    { id: 'i5', date: '2026-11-13', description: 'Taxi at the airport rank', categoryId: 'local_transport', amountMinor: 30_000, originalMinor: 30_000, originalCurrency: 'INR', paymentMode: 'cash',
      justification: 'The rank takes cash only.', fileIds: [], missingProofs: 0,
      flags: [{ ruleId: 'CASH_NOT_IN_STATEMENT', severity: 'warn', message: 'Paid in cash, so there is no statement line. Justified: “The rank takes cash only.”' }] },
  ],
});

// The schema's arithmetic checks (item sum = claim total, amount left) keep the numbers above honest.
export function sampleView(): ClaimView {
  return { status: 'submitted', submittedAt: '2026-11-16T09:31:00.000Z', payload, reviews: [], sample: true };
}
