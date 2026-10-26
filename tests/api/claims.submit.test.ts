import { describe, expect, it } from 'vitest';
import { CLAIM_LIMITS } from '../../src/shared/claim.ts';
import { filesFor, newToken, PNG_BYTES, submission, testApp, validPayload } from './helpers/claims.ts';

describe('REQ-CLM-04: submitting a claim', () => {
  it('REQ-CLM-04: stores the claim and answers 201; the review link then shows it', async () => {
    const t = testApp();
    const s = submission();
    const res = await t.submit(s);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, duplicate: false });
    const view = (await (await t.request(`/api/review/${s.reviewToken}`)).json()) as { view: { status: string; payload: { items: unknown[] } } };
    expect(view.view.status).toBe('submitted');
    expect(view.view.payload.items).toHaveLength(5);
  });

  it('REQ-CLM-04: the same idempotency key and links is the same claim, not a second one', async () => {
    const t = testApp();
    const s = submission();
    expect((await t.submit(s)).status).toBe(201);
    const again = submission({ payload: s.payload, reviewToken: s.reviewToken, ownerToken: s.ownerToken });
    const res = await t.submit(again);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(t.claims._claims.size).toBe(1);
  });

  it('REQ-CLM-04: the same key with different links is refused (409)', async () => {
    const t = testApp();
    const s = submission();
    await t.submit(s);
    const res = await t.submit(submission({ payload: s.payload }));
    expect(res.status).toBe(409);
  });

  it('REQ-CLM-04: the same key and links but different content is refused, never reported as "already sent"', async () => {
    const t = testApp();
    const s = submission();
    await t.submit(s);
    const changed = structuredClone(s.payload);
    changed.items[1]!.description = 'Changed after the first try';
    const res = await t.submit(submission({ payload: changed, reviewToken: s.reviewToken, ownerToken: s.ownerToken }));
    expect(res.status).toBe(409);
  });

  it('REQ-CLM-04: a claim with an error flag cannot be submitted', async () => {
    const t = testApp();
    const payload = validPayload();
    payload.items[0]!.flags = [{ ruleId: 'UNVERIFIED_AMOUNT', severity: 'error', message: 'Not yet matched' }];
    const res = await t.submit(submission({ payload }));
    expect(res.status).toBe(400);
    expect(t.claims._claims.size).toBe(0);
  });

  it('REQ-CLM-08: the claimed amount must be the statement debit', async () => {
    const t = testApp();
    const payload = validPayload();
    payload.items[0]!.statementRef!.debitMinor += 1;
    expect((await t.submit(submission({ payload }))).status).toBe(400);
  });

  it('REQ-CLM-08: a bank-paid item without its statement line is refused', async () => {
    const t = testApp();
    const payload = validPayload();
    delete payload.items[0]!.statementRef;
    expect((await t.submit(submission({ payload }))).status).toBe(400);
  });

  it('REQ-CLM-04: totals that do not add up are refused', async () => {
    const t = testApp();
    const payload = validPayload();
    payload.position.thisClaimMinor += 100;
    expect((await t.submit(submission({ payload }))).status).toBe(400);
  });

  it('REQ-CLM-04: invalid input gets a 400 that names the field and never echoes the value', async () => {
    const t = testApp();
    const payload = validPayload();
    payload.claimant.email = 'secret-not-an-email';
    const res = await t.submit(submission({ payload }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('claimant.email');
    expect(text).not.toContain('secret-not-an-email');
  });

  it('REQ-CLM-04: broken JSON, or no payload at all, is a 400, not a crash', async () => {
    const t = testApp();
    expect((await t.submit(submission({ rawPayload: '{not json' }))).status).toBe(400);
    const form = new FormData();
    form.set('reviewToken', newToken());
    expect((await t.request('/api/claims', { method: 'POST', body: form })).status).toBe(400);
    expect((await t.request('/api/claims', { method: 'POST', body: 'plain text' })).status).toBe(400);
  });

  it('REQ-CLM-04: the two links must look like 256-bit tokens and differ from each other', async () => {
    const t = testApp();
    expect((await t.submit(submission({ reviewToken: 'short' }))).status).toBe(400);
    const same = newToken();
    expect((await t.submit(submission({ reviewToken: same, ownerToken: same }))).status).toBe(400);
    expect((await t.submit(submission({ reviewToken: 'sample' }))).status).toBe(400);
  });

  it('REQ-CLM-04: a file over 1 MB, or one that is not what it says, is refused', async () => {
    const t = testApp();
    const payload = validPayload();
    const files = filesFor(payload);
    files['f-upi'] = { bytes: new Uint8Array(CLAIM_LIMITS.fileBytes + 1).fill(0x41), mime: 'image/png' };
    expect((await t.submit(submission({ payload, files }))).status).toBe(413);

    const fake = filesFor(payload);
    fake['f-upi'] = { bytes: new TextEncoder().encode('<script>alert(1)</script>'), mime: 'image/png' };
    expect((await t.submit(submission({ payload, files: fake }))).status).toBe(415);
    expect(t.claims._claims.size).toBe(0);
  });

  it('REQ-CLM-04: a missing file, or an extra one the claim does not list, is refused', async () => {
    const t = testApp();
    const payload = validPayload();
    const missing = filesFor(payload);
    delete missing['f-upi'];
    expect((await t.submit(submission({ payload, files: missing }))).status).toBe(400);
    const extra = { ...filesFor(payload), 'f-extra': { bytes: PNG_BYTES, mime: 'image/png' } };
    expect((await t.submit(submission({ payload, files: extra }))).status).toBe(400);
  });

  it('REQ-CLM-04: more than 40 attachments, or more than 25 MB in all, is refused', async () => {
    const t = testApp();
    const many = validPayload();
    many.files = Array.from({ length: 41 }, (_, i) => ({ id: `g${i}`, name: `d${i}.txt`, mime: 'text/plain' as const, kind: 'grant_doc' as const }));
    many.items.forEach((i) => (i.fileIds = []));
    expect((await t.submit(submission({ payload: many }))).status).toBe(400); // schema limit

    const big = validPayload();
    big.files = Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, name: `d${i}.pdf`, mime: 'application/pdf' as const, kind: 'grant_doc' as const }));
    big.items.forEach((i) => (i.fileIds = []));
    const pdf = new Uint8Array(900_000).fill(0x41);
    pdf.set(new TextEncoder().encode('%PDF-1.4'));
    const files = Object.fromEntries(big.files.map((f) => [f.id, { bytes: pdf, mime: 'application/pdf' }]));
    expect((await t.submit(submission({ payload: big, files }))).status).toBe(413); // 27 MB
  });

  it('REQ-PRIV-02: only the fields of the payload are kept; extra fields are not stored', async () => {
    const t = testApp();
    const s = submission();
    const raw = JSON.parse(JSON.stringify(s.payload)) as Record<string, unknown>;
    raw.balanceMinor = 123456;
    (raw.items as Record<string, unknown>[])[0]!.statementRef = { ...(s.payload.items[0]!.statementRef as object), balanceMinor: 999, accountNumber: '1234567890' };
    await t.submit(submission({ payload: s.payload, rawPayload: JSON.stringify(raw), reviewToken: s.reviewToken, ownerToken: s.ownerToken }));
    const stored = JSON.stringify([...t.claims._claims.values()].map((c) => c.claim.payload));
    expect(stored).not.toContain('1234567890');
    expect(stored).not.toContain('balanceMinor');
  });
});
