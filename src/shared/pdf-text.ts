// REQ-CLM-02: text for the PDF. The PDF's standard fonts cover Latin-1 and a few typographic marks, not ₹ or symbols such as ⚠,
// so rupees are written "Rs." and anything else outside that set becomes "?". Pure.
import { formatInr } from './money.ts';

export const pdfInr = (paise: number): string => formatInr(paise).replace('₹', 'Rs. ');

const KEEP = /[ -~ -ÿ‘’“”–—…•]/;
export function pdfText(text: string): string {
  return [...text.replace(/₹/g, 'Rs. ').replace(/\s+/g, ' ')].map((ch) => (KEEP.test(ch) ? ch : '?')).join('').trim();
}

export const SEVERITY_WORDS = { error: 'Error', warn: 'Warning', info: 'Note' } as const;
