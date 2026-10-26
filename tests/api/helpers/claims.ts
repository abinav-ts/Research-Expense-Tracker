import { createApp } from '../../../src/server/app.ts';
import { sampleView } from '../../../src/server/claims/sample.ts';
import type { ClaimPayload } from '../../../src/shared/claim.ts';
import { memoryClaimRepo } from './memory-claims.ts';

export const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64'));

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
/** A fresh 256-bit token, as the browser makes them. */
export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

/** The sample claim's data, made into a submittable claim with a new key. */
export function validPayload(key = `key-${crypto.randomUUID()}`): ClaimPayload {
  const payload = structuredClone(sampleView().payload);
  payload.idempotencyKey = key;
  return payload;
}

/** Bytes for every file a payload lists. */
export function filesFor(payload: ClaimPayload): Record<string, { bytes: Uint8Array; mime: string }> {
  return Object.fromEntries(payload.files.map((f) => [f.id, { bytes: f.mime === 'image/png' ? PNG_BYTES : new TextEncoder().encode(`proof ${f.id}`), mime: f.mime }]));
}

export interface SubmissionOptions {
  payload?: ClaimPayload;
  reviewToken?: string;
  ownerToken?: string;
  files?: Record<string, { bytes: Uint8Array; mime: string }>;
  rawPayload?: string;
}

export function submission(o: SubmissionOptions = {}) {
  const payload = o.payload ?? validPayload();
  const reviewToken = o.reviewToken ?? newToken();
  const ownerToken = o.ownerToken ?? newToken();
  const form = new FormData();
  form.set('payload', o.rawPayload ?? JSON.stringify(payload));
  form.set('reviewToken', reviewToken);
  form.set('ownerToken', ownerToken);
  for (const [id, f] of Object.entries(o.files ?? filesFor(payload))) form.set(id, new File([f.bytes as BlobPart], id, { type: f.mime }));
  return { payload, reviewToken, ownerToken, form };
}

export function testApp(options: { now?: () => Date } = {}) {
  const claims = memoryClaimRepo();
  let n = 0;
  const app = createApp(() => ({
    health: { ping: async (nowIso: string) => ({ hits: 1, checkedAt: nowIso }) },
    claims,
    now: options.now ?? (() => new Date('2026-11-16T10:00:00Z')),
    newId: () => `claim-${++n}`,
  }));
  const request = (path: string, init?: RequestInit) => app.request(path, init);
  const submit = (s = submission(), headers: Record<string, string> = {}) => request('/api/claims', { method: 'POST', body: s.form, headers });
  const put = (path: string, body: unknown) => request(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { app, claims, request, submit, put, post };
}
