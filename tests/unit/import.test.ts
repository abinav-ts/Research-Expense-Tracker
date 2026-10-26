import { describe, expect, it } from 'vitest';
import { checkFile, isHeic, jpegName, MAX_CLAIM_FILE_BYTES, TOO_LARGE_NOTE } from '../../src/shared/files.ts';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('REQ-CAP-02: picker / camera / files import', () => {
  it('REQ-CAP-02: a mixed selection keeps the valid files and reports each skipped one', () => {
    const picked = [f('a.png', 'image/png'), f('notes.docx', 'application/msword'), f('b.jpg', 'image/jpeg'), f('photo.heic', 'image/heic')];
    const results = picked.map(checkFile);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const skipped = results.filter((r) => !r.ok).map((r) => (r.ok ? '' : r.message));
    expect(skipped).toEqual([
      '"notes.docx" was skipped: use PDF, JPG, PNG, WebP, HEIC.',
      '"photo.heic" is a HEIC photo and this browser cannot open it. Open ExpRes in Safari on your iPhone, or share the photo as a JPEG.',
    ]); // a HEIC that reaches this check unconverted gets its own, honest message
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

describe('REQ-CAP-02: iPhone (HEIC) photos', () => {
  it('REQ-CAP-02: HEIC and HEIF are recognised by type or, when the browser gives none, by extension', () => {
    for (const file of [
      { name: 'IMG_1.HEIC', type: 'image/heic' }, { name: 'IMG_1.heif', type: 'image/heif' }, { name: 'IMG_1.HEIC', type: '' },
      { name: 'x.hif', type: '' }, { name: 'noext', type: 'image/heic-sequence' },
    ]) expect(isHeic(file), file.name + file.type).toBe(true);
    for (const file of [{ name: 'a.jpg', type: 'image/jpeg' }, { name: 'heic.png', type: 'image/png' }, { name: 'a.pdf', type: 'application/pdf' }]) {
      expect(isHeic(file), file.name).toBe(false);
    }
  });

  it('REQ-CAP-02: a converted photo is named .jpg and keeps its stem', () => {
    expect(jpegName('IMG_7837.HEIC')).toBe('IMG_7837.jpg');
    expect(jpegName('my.photo.heif')).toBe('my.photo.jpg');
  });
});
