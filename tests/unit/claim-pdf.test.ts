import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sampleView } from '../../src/server/claims/sample.ts';
import { buildClaimPdf, type PdfProof } from '../../src/client/lib/claim-pdf.ts';
import { pdfInr, pdfText } from '../../src/shared/pdf-text.ts';

const asText = (bytes: ArrayBuffer) => new TextDecoder('latin1').decode(bytes);
const png = `data:image/png;base64,${readFileSync(new URL('../../fixtures/upi-success.png', import.meta.url)).toString('base64')}`;

describe('REQ-CLM-02: the claim pack PDF', () => {
  it('REQ-CLM-02: writes rupees as Rs. and replaces symbols the PDF fonts cannot draw', () => {
    expect(pdfInr(1_723_055)).toBe('Rs. 17,230.55');
    expect(pdfText('Paid ₹300 ⚠ “quoted” — fine')).toBe('Paid Rs. 300 ? “quoted” — fine');
  });

  it('REQ-CLM-02: builds a PDF from the claim with cover, items, categories and proofs, in the browser-free builder', async () => {
    const { payload } = sampleView();
    const proofs = new Map<string, PdfProof>([
      ['f-upi', { image: { dataUrl: png, format: 'PNG', width: 600, height: 800 } }],
      ['f-card', { text: 'INR 24,500.00 spent on card at HOTEL SAMPLE' }],
    ]);
    const { bytes, pages } = await buildClaimPdf(payload, proofs, undefined, { compress: false });
    const text = asText(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(pages).toBeGreaterThanOrEqual(3);
    for (const needle of ['Claim pack', 'Claim total: Rs. 44,520.55', 'Asha Sample', 'HOTEL SAMPLE', 'Lisbon Computing Society', 'Rs. 17,230.55', 'By category', 'Declaration', 'Flags and notes']) {
      expect(text, needle).toContain(needle);
    }
    expect(text).not.toContain('₹');
  });

  it('REQ-CLM-02: a claim with no flags has no flags section, and 40 items run to several pages', async () => {
    const { payload } = structuredClone(sampleView());
    payload.items = payload.items.filter((i) => i.flags.length === 0).slice(0, 1);
    payload.position.thisClaimMinor = payload.items[0]!.amountMinor;
    const clean = asText((await buildClaimPdf(payload, new Map(), undefined, { compress: false })).bytes);
    expect(clean).not.toContain('Flags and notes');

    const many = structuredClone(sampleView().payload);
    many.items = Array.from({ length: 40 }, (_, n) => ({ ...many.items[0]!, id: `m${n}`, fileIds: [], description: `Item number ${n}` }));
    many.files = [];
    many.position.thisClaimMinor = many.items.reduce((s, i) => s + i.amountMinor, 0);
    const { bytes, pages } = await buildClaimPdf(many, new Map(), undefined, { compress: false });
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(asText(bytes)).toContain(`page ${pages} of ${pages}`);
    expect(asText(bytes).match(/Statement line \/ cash/g)!.length).toBeGreaterThanOrEqual(2); // the header repeats on each page
  });
});
