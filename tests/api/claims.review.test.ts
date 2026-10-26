import { describe, expect, it } from 'vitest';
import type { ClaimView } from '../../src/shared/claim.ts';
import { submission, testApp } from './helpers/claims.ts';

async function submitted() {
  const t = testApp();
  const s = submission();
  await t.submit(s);
  const review = `/api/review/${s.reviewToken}`;
  const view = async (path = review) => ((await (await t.request(path)).json()) as { view: ClaimView }).view;
  const ids = s.payload.items.map((i) => i.id);
  return { t, s, review, view, ids };
}

describe('REQ-REV-01: the reviewer opens the link', () => {
  it('REQ-REV-01: shows the claim with no sign-in, and the owner link shows the same claim', async () => {
    const { t, s, view } = await submitted();
    const v = await view();
    expect(v.payload.claimant.name).toBe('Asha Sample');
    expect(v.payload.position.thisClaimMinor).toBe(4_452_055);
    const owner = await view(`/api/owner/${s.ownerToken}`);
    expect(owner.payload.trip.name).toBe(v.payload.trip.name);
    expect((await t.request(`/api/owner/${s.reviewToken}`)).status).toBe(404); // the two links are not interchangeable
    expect((await t.request(`/api/review/${s.ownerToken}`)).status).toBe(404);
  });

  it('REQ-REV-01: an unknown or malformed link says "not valid", as JSON, and nothing else', async () => {
    const { t } = await submitted();
    for (const bad of ['nope', 'x'.repeat(43), 'a'.repeat(500), 'Sample', 'sample%20']) {
      const res = await t.request(`/api/review/${bad}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, error: 'This link is not valid.' });
    }
    for (const odd of ['%2e%2e', '%00', 'a/b']) expect((await t.request(`/api/review/${odd}`)).status).toBe(404);
  });

  it('REQ-REV-01: the reviewer cannot change the claim itself', async () => {
    const { t, review } = await submitted();
    expect((await t.put(review, { items: [] })).status).toBe(404);
    expect((await t.post(review, {})).status).toBe(404);
    expect((await t.request(review, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('REQ-REV-02: per-item decisions', () => {
  it('REQ-REV-02: saves a decision with a comment, replaces it, and the first one moves the claim to "in review"', async () => {
    const { t, review, view, ids } = await submitted();
    expect((await t.put(`${review}/items/${ids[0]}`, { decision: 'query', comment: 'Which day was this?' })).status).toBe(200);
    let v = await view();
    expect(v.status).toBe('in_review');
    expect(v.reviews).toEqual([{ itemId: ids[0], decision: 'query', comment: 'Which day was this?' }]);
    await t.put(`${review}/items/${ids[0]}`, { decision: 'approve' });
    v = await view();
    expect(v.reviews).toEqual([{ itemId: ids[0], decision: 'approve', comment: '' }]);
  });

  it('REQ-REV-02: refuses an unknown item, a bad decision and a comment over 1,000 characters', async () => {
    const { t, review, ids } = await submitted();
    expect((await t.put(`${review}/items/nope`, { decision: 'approve' })).status).toBe(404);
    expect((await t.put(`${review}/items/${ids[0]}`, { decision: 'maybe' })).status).toBe(400);
    expect((await t.put(`${review}/items/${ids[0]}`, { decision: 'reject', comment: 'x'.repeat(1001) })).status).toBe(400);
    expect((await t.put(`${review}/items/${ids[0]}`, { decision: 'reject', comment: 'x'.repeat(1000) })).status).toBe(200);
  });
});

describe('REQ-REV-03: overall decision and lock', () => {
  it('REQ-REV-03: cannot finish while an item is undecided or only queried', async () => {
    const { t, review, ids } = await submitted();
    for (const id of ids.slice(1)) await t.put(`${review}/items/${id}`, { decision: 'approve' });
    await t.put(`${review}/items/${ids[0]}`, { decision: 'query' });
    const res = await t.post(`${review}/decision`, {});
    expect(res.status).toBe(422);
    expect(((await res.json()) as { undecided: string[] }).undecided).toEqual([ids[0]]);
  });

  it.each([
    ['approved', 5, 0],
    ['rejected', 0, 5],
    ['partially_approved', 3, 2],
  ])('REQ-REV-03: %s when %i are approved and %i rejected', async (status, approve, reject) => {
    const { t, review, view, ids } = await submitted();
    for (const [n, id] of ids.entries()) await t.put(`${review}/items/${id}`, { decision: n < approve ? 'approve' : 'reject' });
    expect(approve + reject).toBe(5);
    const res = await t.post(`${review}/decision`, { comment: 'All done' });
    expect(await res.json()).toEqual({ ok: true, status });
    const v = await view();
    expect(v.status).toBe(status);
    expect(v.overallComment).toBe('All done');
    expect(v.decidedAt).toBe('2026-11-16T10:00:00.000Z');
  });

  it('REQ-REV-03: after finishing, item changes and a second finish are refused (409), and nothing changes', async () => {
    const { t, review, view, ids } = await submitted();
    for (const id of ids) await t.put(`${review}/items/${id}`, { decision: 'approve' });
    await t.post(`${review}/decision`, { comment: 'First' });
    expect((await t.put(`${review}/items/${ids[0]}`, { decision: 'reject' })).status).toBe(409);
    expect((await t.post(`${review}/decision`, { comment: 'Second' })).status).toBe(409);
    const v = await view();
    expect(v.status).toBe('approved');
    expect(v.overallComment).toBe('First');
    expect(v.reviews.every((r) => r.decision === 'approve')).toBe(true);
  });

  it('REQ-REV-03: the overall comment is limited to 2,000 characters', async () => {
    const { t, review, ids } = await submitted();
    for (const id of ids) await t.put(`${review}/items/${id}`, { decision: 'approve' });
    expect((await t.post(`${review}/decision`, { comment: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('REQ-CLM-07: the owner link shows the decisions, comments and overall outcome', async () => {
    const { t, s, review, ids } = await submitted();
    await t.put(`${review}/items/${ids[0]}`, { decision: 'reject', comment: 'Duplicate' });
    for (const id of ids.slice(1)) await t.put(`${review}/items/${id}`, { decision: 'approve' });
    await t.post(`${review}/decision`, { comment: 'Fine otherwise' });
    const v = ((await (await t.request(`/api/owner/${s.ownerToken}`)).json()) as { view: ClaimView }).view;
    expect(v.status).toBe('partially_approved');
    expect(v.reviews.find((r) => r.itemId === ids[0])).toEqual({ itemId: ids[0], decision: 'reject', comment: 'Duplicate' });
    expect(v.overallComment).toBe('Fine otherwise');
  });
});

describe('REQ-REV-04: proofs', () => {
  it('REQ-REV-04: serves a proof with its own type, no sniffing, as a sandboxed inline file', async () => {
    const { t, review, s } = await submitted();
    const png = s.payload.files.find((f) => f.mime === 'image/png')!;
    const res = await t.request(`${review}/files/${png.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const txt = s.payload.files.find((f) => f.mime === 'text/plain')!;
    expect((await t.request(`${review}/files/${txt.id}`)).headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('REQ-REV-04: needs the right link, and a file of another claim is not reachable', async () => {
    const { t, review } = await submitted();
    const other = submission();
    await t.submit(other);
    expect((await t.request(`/api/review/${other.reviewToken}/files/nope`)).status).toBe(404);
    expect((await t.request(`${review}/files/nope`)).status).toBe(404);
    expect((await t.request(`/api/review/${'a'.repeat(43)}/files/f-upi`)).status).toBe(404);
    expect((await t.request(`/api/owner/${other.ownerToken}`)).status).toBe(200);
  });
});

describe('REQ-DEMO-03: the sample claim', () => {
  it('REQ-DEMO-03: /api/review/sample serves a valid sample claim and its proofs without a database row', async () => {
    const t = testApp();
    const res = await t.request('/api/review/sample');
    expect(res.status).toBe(200);
    const { view } = (await res.json()) as { view: ClaimView };
    expect(view.sample).toBe(true);
    expect(view.payload.files.length).toBeGreaterThan(0);
    for (const f of view.payload.files) expect((await t.request(`/api/review/sample/files/${f.id}`)).status).toBe(200);
    expect(t.claims._claims.size).toBe(0);
  });

  it('REQ-DEMO-03: the sample cannot be saved to: decisions stay in the browser', async () => {
    const t = testApp();
    expect((await t.put('/api/review/sample/items/i1', { decision: 'approve' })).status).toBe(403);
    expect((await t.post('/api/review/sample/decision', {})).status).toBe(403);
  });
});
