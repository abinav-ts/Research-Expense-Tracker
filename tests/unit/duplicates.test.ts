import { describe, expect, it } from 'vitest';
import { duplicateMessage, findDuplicates, type DuplicateCandidate } from '../../src/shared/duplicates.ts';
import type { Expense } from '../../src/shared/types.ts';

let n = 0;
const saved = (extra: Partial<Expense> = {}): Expense => ({
  id: `e${++n}`, tripId: 't', date: '2026-11-12', payee: 'Blossom Book House', originalMinor: 56_000, originalCurrency: 'INR', inrMinor: 56_000,
  inrStatus: 'pending', paymentMode: 'bank', source: 'manual', attachments: [], excluded: false, createdAt: 'x', updatedAt: 'x', ...extra,
});
const proof = (sha256: string) => ({ id: 'a', kind: 'proof' as const, mime: 'image/png', name: 'x.png', sizeBytes: 1, sha256, blobKey: 'k' });
const candidate = (extra: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  payee: 'Blossom Book House', date: '2026-11-12', originalMinor: 56_000, originalCurrency: 'INR', proofHashes: [], ...extra,
});

describe('REQ-CAP-07: duplicate detection', () => {
  it('REQ-CAP-07: the same non-empty reference is a duplicate, whatever else differs', () => {
    const m = findDuplicates(candidate({ payee: 'Other', date: '2027-01-01', originalMinor: 1, reference: ' inv-4471 ' }), [saved({ reference: 'INV-4471' })]);
    expect(m.map((x) => x.reason)).toEqual(['reference']);
  });

  it('REQ-CAP-07: an empty reference never matches another empty reference', () => {
    expect(findDuplicates(candidate({ payee: 'Other', reference: '' }), [saved({ reference: '' })])).toEqual([]);
    expect(findDuplicates(candidate({ payee: 'Other', date: '2020-01-01', reference: undefined as unknown as string }), [saved()])).toEqual([]);
  });

  it('REQ-CAP-07: the same amount, date and payee (ignoring case and punctuation) is a duplicate', () => {
    const m = findDuplicates(candidate({ payee: 'BLOSSOM  book-house.' }), [saved()]);
    expect(m.map((x) => x.reason)).toEqual(['details']);
  });

  it('REQ-CAP-07: a different amount, date, payee or currency alone is not a duplicate', () => {
    for (const change of [{ originalMinor: 56_001 }, { date: '2026-11-13' }, { payee: 'Blossom Books' }, { originalCurrency: 'EUR' }]) {
      expect(findDuplicates(candidate(change), [saved()]), JSON.stringify(change)).toEqual([]);
    }
  });

  it('REQ-CAP-07: a proof with the same SHA-256 is a duplicate even when every typed detail differs', () => {
    const m = findDuplicates(candidate({ payee: 'Typed differently', date: '2030-01-01', originalMinor: 9, proofHashes: ['abc123'] }), [saved({ attachments: [proof('abc123')] })]);
    expect(m.map((x) => x.reason)).toEqual(['proof']);
  });

  it('REQ-CAP-07: a different file is not a duplicate; a missing hash never matches', () => {
    expect(findDuplicates(candidate({ payee: 'X', proofHashes: ['zzz'] }), [saved({ attachments: [proof('abc')] })])).toEqual([]);
    expect(findDuplicates(candidate({ payee: 'X', proofHashes: [''] }), [saved({ attachments: [proof('')] })])).toEqual([]);
  });

  it('REQ-CAP-07: the strongest reason is reported once per saved expense (reference, then proof, then details)', () => {
    const e = saved({ reference: 'R1', attachments: [proof('h')] });
    expect(findDuplicates(candidate({ reference: 'R1', proofHashes: ['h'] }), [e]).map((x) => x.reason)).toEqual(['reference']);
    expect(findDuplicates(candidate({ proofHashes: ['h'] }), [e]).map((x) => x.reason)).toEqual(['proof']);
  });

  it('REQ-CAP-07: editing an expense does not make it a duplicate of itself, but a second copy is still found', () => {
    const a = saved();
    const b = saved();
    expect(findDuplicates(candidate({ id: a.id }), [a])).toEqual([]);
    expect(findDuplicates(candidate({ id: a.id }), [a, b]).map((x) => x.expense.id)).toEqual([b.id]);
  });

  it('REQ-CAP-07: all matching expenses are listed', () => {
    expect(findDuplicates(candidate(), [saved(), saved(), saved({ payee: 'Elsewhere' })])).toHaveLength(2);
  });

  it('REQ-CAP-07: the message says what it matched and why, and notes an excluded one', () => {
    const [m] = findDuplicates(candidate({ reference: 'R1' }), [saved({ reference: 'R1' })]);
    expect(duplicateMessage(m!)).toBe('Looks like a duplicate of Blossom Book House ₹560.00 on 12 Nov 2026 (the same reference number)');
    const [x] = findDuplicates(candidate(), [saved({ excluded: true })]);
    expect(duplicateMessage(x!)).toBe('Looks like a duplicate of Blossom Book House ₹560.00 on 12 Nov 2026 (the same amount, date and payee), which is excluded from the claim');
    const [f] = findDuplicates(candidate({ originalMinor: 18_000, originalCurrency: 'EUR' }), [saved({ originalMinor: 18_000, originalCurrency: 'EUR', inrMinor: 1_710_000 })]);
    expect(duplicateMessage(f!)).toContain('EUR 180.00');
  });
});
