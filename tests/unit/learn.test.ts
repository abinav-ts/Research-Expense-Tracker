import { describe, expect, it } from 'vitest';
import { applyAnchors, learnAnchors, type Anchor } from '../../src/shared/learn.ts';
import { suggestFields } from '../../src/shared/suggest.ts';

const asAnchors = (drafts: ReturnType<typeof learnAnchors>): Anchor[] => drafts.map((d, i) => ({ ...d, id: String(i), count: 1 }));

// A format the generic reader does not know: the learner has to supply it.
const FIRST = 'Txn: 2399 INR >> SHOP ONE << 25OCT26 Ref 34567';
const CONFIRMED = { payee: 'SHOP ONE', reference: '34567', amountMinor: 239_900, currency: 'INR', date: '2026-10-25' };

describe('REQ-CAP-16: learning a message format', () => {
  it('REQ-CAP-16: remembers up to two words before and one after each confirmed value', () => {
    const drafts = learnAnchors(FIRST, CONFIRMED);
    expect(drafts.find((d) => d.field === 'payee')).toEqual({ field: 'payee', before: ['inr', '>>'], after: '<<' });
    expect(drafts.find((d) => d.field === 'reference')).toEqual({ field: 'reference', before: ['ref'], after: null });
    expect(drafts.map((d) => d.field).sort()).toEqual(['amount', 'date', 'payee', 'reference']);
  });

  it('REQ-CAP-16: never stores amounts, dates, references or message text, only the words around them', () => {
    const stored = JSON.stringify(learnAnchors(FIRST, CONFIRMED)).toLowerCase();
    for (const secret of ['2399', 'shop one', '25oct26', '34567', 'shop', '2026']) expect(stored, secret).not.toContain(secret);
  });

  it('REQ-CAP-16: the next message in the same format is read, in a layout the generic reader cannot read', () => {
    const next = 'Txn: 77 INR >> NEW PLACE << 02NOV26 Ref 99887';
    expect(suggestFields(next).payee.map((p) => p.label)).not.toContain('NEW PLACE'); // generic rules miss it
    const anchors = asAnchors(learnAnchors(FIRST, CONFIRMED));
    const s = suggestFields(next, { anchors });
    expect(s.payee[0]).toMatchObject({ label: 'NEW PLACE', hint: 'same layout as before' });
    expect(s.reference[0]).toMatchObject({ label: '99887', hint: 'same layout as before' });
    expect(applyAnchors(next, anchors, 'amount')).toMatchObject({ amountText: '77' });
    expect(applyAnchors(next, anchors, 'date')).toMatchObject({ date: '2026-11-02' });
    // the learned layout also creates suggestions the generic reader had none for
    expect(suggestFields(next).amount).toEqual([]);
    expect(s.amount[0]).toMatchObject({ label: '₹77.00', hint: 'same layout as before', patch: { amountText: '77', currency: 'INR' } });
    expect(s.date[0]).toMatchObject({ label: '2 Nov 2026', patch: { date: '2026-11-02' } });
  });

  it('REQ-CAP-16: the spec example: "Rs 2399 spent@ SHOP ONE on 25OCT26" then "Rs 150 spent@ OTHER CAFE on 01NOV26" reads payee OTHER CAFE', () => {
    const anchors = asAnchors(learnAnchors('Rs 2399 spent@ SHOP ONE on 25OCT26', { payee: 'SHOP ONE' }));
    expect(applyAnchors('Rs 150 spent@ OTHER CAFE on 01NOV26', anchors, 'payee')).toEqual({ payee: 'OTHER CAFE' });
  });

  it('REQ-CAP-16: a value that appears twice in the text is ambiguous, so nothing is learned for it', () => {
    expect(learnAnchors('SHOP ONE paid SHOP ONE today', { payee: 'SHOP ONE' })).toEqual([]);
  });

  it('REQ-CAP-16: a value that is not in the text teaches nothing (the user typed something else)', () => {
    expect(learnAnchors(FIRST, { payee: 'Something Else', reference: 'ZZZ999' })).toEqual([]);
  });

  it('REQ-CAP-16: anchor words never include digits, so a number cannot leak in as an "anchor"', () => {
    const drafts = learnAnchors('code 4455 SHOP ONE 7788 end', { payee: 'SHOP ONE' });
    expect(JSON.stringify(drafts)).not.toMatch(/\d/);
  });

  it('REQ-CAP-16: the most-used anchor wins when several fit', () => {
    const anchors: Anchor[] = [
      { id: 'a', field: 'payee', before: ['at'], after: null, count: 1 },
      { id: 'b', field: 'payee', before: ['via'], after: null, count: 5 },
    ];
    expect(applyAnchors('paid at ONE via TWO', anchors, 'payee')).toEqual({ payee: 'TWO' });
  });

  it('REQ-CAP-16: with no matching anchor, nothing is returned', () => {
    expect(applyAnchors('hello world', asAnchors(learnAnchors(FIRST, CONFIRMED)), 'payee')).toBeUndefined();
  });
});
