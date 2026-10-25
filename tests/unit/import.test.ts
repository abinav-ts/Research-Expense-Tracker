import { describe, expect, it } from 'vitest';
import { checkFile, MAX_CLAIM_FILE_BYTES, TOO_LARGE_NOTE } from '../../src/shared/files.ts';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('REQ-CAP-02: picker / camera / files import', () => {
  it('REQ-CAP-02: a mixed selection keeps the valid files and reports each skipped one', () => {
    const picked = [f('a.png', 'image/png'), f('notes.docx', 'application/msword'), f('b.jpg', 'image/jpeg'), f('photo.heic', 'image/heic')];
    const results = picked.map(checkFile);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const skipped = results.filter((r) => !r.ok).map((r) => (r.ok ? '' : r.message));
    expect(skipped).toEqual(['"notes.docx" was skipped: use PDF, JPG, PNG, WebP.', '"photo.heic" was skipped: use PDF, JPG, PNG, WebP.']);
  });

  it('REQ-CAP-02: a PDF over 1 MB is accepted into the Inbox with the "too large" note', () => {
    const r = checkFile(f('ticket.pdf', 'application/pdf', MAX_CLAIM_FILE_BYTES + 1));
    expect(r).toMatchObject({ ok: true, isPdf: true, overLimit: true });
    expect(TOO_LARGE_NOTE).toBe('Too large to include in a claim (max 1 MB)');
  });

  it('REQ-CAP-02: an empty selection (picker cancelled) produces nothing', () => {
    expect([].map(checkFile)).toEqual([]);
  });
});
