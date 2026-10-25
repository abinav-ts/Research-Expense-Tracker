import { describe, expect, it } from 'vitest';
import { ACCEPTED_TYPES_TEXT, checkFile, formatBytes, MAX_CLAIM_FILE_BYTES } from '../../src/shared/files.ts';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('REQ-SET-07: grant documents (store only)', () => {
  it('REQ-SET-07: accepts PDF, JPG, PNG and WebP', () => {
    expect(checkFile(f('sanction.pdf', 'application/pdf'))).toEqual({ ok: true, mime: 'application/pdf', isPdf: true, overLimit: false });
    for (const [name, type] of [['a.jpg', 'image/jpeg'], ['b.png', 'image/png'], ['c.webp', 'image/webp']] as const) {
      expect(checkFile(f(name, type))).toMatchObject({ ok: true, isPdf: false });
    }
  });

  it('REQ-SET-07: falls back to the extension when the browser reports no type', () => {
    expect(checkFile(f('Letter.JPEG', ''))).toMatchObject({ ok: true, mime: 'image/jpeg' });
  });

  it('REQ-SET-07: rejects .docx with a message listing the accepted types', () => {
    const r = checkFile(f('budget.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(r).toEqual({ ok: false, message: `"budget.docx" was skipped: use ${ACCEPTED_TYPES_TEXT}.` });
    expect(ACCEPTED_TYPES_TEXT).toBe('PDF, JPG, PNG, WebP');
  });

  it('REQ-SET-07: a file over 1 MB is accepted but marked over the claim limit', () => {
    expect(checkFile(f('big.pdf', 'application/pdf', MAX_CLAIM_FILE_BYTES + 1))).toMatchObject({ ok: true, overLimit: true });
    expect(checkFile(f('ok.pdf', 'application/pdf', MAX_CLAIM_FILE_BYTES))).toMatchObject({ ok: true, overLimit: false });
  });

  it('REQ-SET-07: shows sizes readably', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
  });
});
