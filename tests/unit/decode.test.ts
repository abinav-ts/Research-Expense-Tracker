import { describe, expect, it } from 'vitest';
import { decodeStatement } from '../../src/client/lib/decode.ts';

const bytes = (...b: number[]) => new Uint8Array(b).buffer;
const text = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const utf16le = (s: string, mark: boolean) => {
  const out = new Uint8Array((s.length + (mark ? 1 : 0)) * 2);
  if (mark) out.set([0xff, 0xfe]);
  for (let i = 0; i < s.length; i++) {
    out[(i + (mark ? 1 : 0)) * 2] = s.charCodeAt(i) & 0xff;
    out[(i + (mark ? 1 : 0)) * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out.buffer;
};

describe('REQ-CSV-01: opening whatever file was chosen', () => {
  it('REQ-CSV-01: UTF-8 text, with and without a byte-order mark, decodes', () => {
    expect(decodeStatement(text('Date,Narration\n1,Café ₹')).ok && (decodeStatement(text('Date,Narration\n1,Café ₹')) as { text: string }).text).toBe('Date,Narration\n1,Café ₹');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Date')]).buffer;
    const r = decodeStatement(withBom);
    expect(r.ok && r.encoding).toBe('UTF-8');
  });

  it('REQ-CSV-01: UTF-16 text (what Excel calls "Unicode Text"), marked or not, decodes', () => {
    const marked = decodeStatement(utf16le('Date\tNarration\n12/11/2026\tShop', true));
    expect(marked).toMatchObject({ ok: true, encoding: 'UTF-16' });
    expect(marked.ok && marked.text).toBe('Date\tNarration\n12/11/2026\tShop');
    const unmarked = decodeStatement(utf16le('Date\tNarration\n12/11/2026\tShop', false));
    expect(unmarked.ok && unmarked.text).toBe('Date\tNarration\n12/11/2026\tShop');
  });

  it('REQ-CSV-01: an old Windows-1252 file (a lone é byte is not valid UTF-8) still decodes, with the letter right', () => {
    const r = decodeStatement(bytes(...[...'Caf'].map((c) => c.charCodeAt(0)), 0xe9, ...[...',Rs 5'].map((c) => c.charCodeAt(0))));
    expect(r).toMatchObject({ ok: true, encoding: 'Windows-1252' });
    expect(r.ok && r.text).toBe('Café,Rs 5');
  });

  it('REQ-CSV-01: a PDF, an Excel file, an old Excel file and a picture each get a message saying what they are and what to do', () => {
    expect(decodeStatement(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toMatchObject({ ok: false, error: expect.stringContaining('This is a PDF') });
    expect(decodeStatement(bytes(0x50, 0x4b, 0x03, 0x04, 0))).toMatchObject({ ok: false, error: expect.stringContaining('Excel (.xlsx)') });
    expect(decodeStatement(bytes(0xd0, 0xcf, 0x11, 0xe0, 0))).toMatchObject({ ok: false, error: expect.stringContaining('old Excel (.xls)') });
    expect(decodeStatement(bytes(0x89, 0x50, 0x4e, 0x47))).toMatchObject({ ok: false, error: expect.stringContaining('picture') });
    expect(decodeStatement(bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ok: false, error: expect.stringContaining('picture') });
  });

  it('REQ-CSV-01: a file named like an Excel or PDF file is refused by name even if its bytes look like text', () => {
    expect(decodeStatement(text('a,b'), 'statement.xlsx')).toMatchObject({ ok: false, error: expect.stringContaining('not a CSV file') });
  });

  it('REQ-CSV-01: an empty file says so', () => {
    expect(decodeStatement(new ArrayBuffer(0))).toEqual({ ok: false, error: 'This file is empty.' });
  });
});
