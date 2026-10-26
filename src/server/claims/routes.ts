// REQ-CLM-04, REQ-REV-01..04, REQ-REV-07, REQ-CLM-07, REQ-DEMO-03: the claim endpoints.
import { Hono, type Context } from 'hono';
import { finishBodySchema, isTokenShape, itemReviewBodySchema, outcomeOf, SAMPLE_TOKEN, type ClaimView } from '../../shared/claim.ts';
import { sha256Text, type ClaimRepo, type StoredClaim } from './repo.ts';
import { SAMPLE_FILES, sampleView } from './sample.ts';
import { parseSubmission, SubmitError } from './validate.ts';

export interface ClaimDeps {
  claims: ClaimRepo;
  now: () => Date;
  newId: () => string;
}

/** Requests allowed per client address per minute (REQ-REV-07). */
export const RATE_LIMITS = { submit: 10, read: 120, badToken: 20 } as const;
const MAX_BODY_BYTES = 30_000_000;

const NOT_VALID = 'This link is not valid.';

export function claimRoutes(depsFor: (c: Context) => ClaimDeps) {
  const app = new Hono();

  const windowOf = (deps: ClaimDeps) => Math.floor(deps.now().getTime() / 60_000);
  const client = (c: Context) => c.req.header('cf-connecting-ip') ?? 'local';
  const tooMany = (c: Context) => {
    c.header('Retry-After', '60');
    return c.json({ ok: false, error: 'Too many requests. Please wait a minute and try again.' }, 429);
  };

  /** Counts a request against `limit` for this client; true when it is over. */
  async function over(c: Context, deps: ClaimDeps, action: keyof typeof RATE_LIMITS) {
    return (await deps.claims.bump(`${action}:${client(c)}`, windowOf(deps))) > RATE_LIMITS[action];
  }

  /** Finds the claim for a link, counting failed guesses. `null` means the response was already made. */
  async function lookup(c: Context, deps: ClaimDeps, kind: 'review' | 'owner', token: string): Promise<StoredClaim | Response> {
    if ((await deps.claims.peek(`badToken:${client(c)}`, windowOf(deps))) >= RATE_LIMITS.badToken) return tooMany(c);
    const claim = isTokenShape(token) && token !== SAMPLE_TOKEN ? await (kind === 'review' ? deps.claims.findByReviewHash : deps.claims.findByOwnerHash)(await sha256Text(token)) : null;
    if (!claim) {
      await deps.claims.bump(`badToken:${client(c)}`, windowOf(deps));
      return c.json({ ok: false, error: NOT_VALID }, 404);
    }
    return claim;
  }

  async function viewOf(deps: ClaimDeps, claim: StoredClaim): Promise<ClaimView> {
    return {
      status: claim.status,
      submittedAt: claim.submittedAt,
      ...(claim.decidedAt && { decidedAt: claim.decidedAt }),
      ...(claim.overallComment && { overallComment: claim.overallComment }),
      payload: claim.payload,
      reviews: await deps.claims.reviews(claim.id),
    };
  }

  app.post('/api/claims', async (c) => {
    const deps = depsFor(c);
    if (await over(c, deps, 'submit')) return tooMany(c);
    const length = Number(c.req.header('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) return c.json({ ok: false, error: 'The claim is too large (limit 25 MB of attachments).' }, 413);
    try {
      const form = await c.req.formData().catch(() => {
        throw new SubmitError(400, 'The claim could not be read.');
      });
      const { payload, reviewToken, ownerToken, files } = await parseSubmission(form);
      const result = await deps.claims.create(
        { id: deps.newId(), idempotencyKey: payload.idempotencyKey, reviewHash: await sha256Text(reviewToken), ownerHash: await sha256Text(ownerToken), submittedAt: deps.now().toISOString(), payload },
        files,
      );
      if (result.result === 'conflict') return c.json({ ok: false, error: 'This submission key was already used for a different claim.' }, 409);
      return c.json({ ok: true, duplicate: result.result === 'duplicate' }, result.result === 'created' ? 201 : 200);
    } catch (error) {
      if (error instanceof SubmitError) return c.json({ ok: false, error: error.message, details: error.details }, error.status);
      return c.json({ ok: false, error: 'The claim could not be saved. Nothing was lost on your device; try again.' }, 500);
    }
  });

  app.get('/api/review/:token', async (c) => {
    const deps = depsFor(c);
    if (await over(c, deps, 'read')) return tooMany(c);
    const token = c.req.param('token');
    if (token === SAMPLE_TOKEN) return c.json({ ok: true, view: sampleView() });
    const claim = await lookup(c, deps, 'review', token);
    if (claim instanceof Response) return claim;
    return c.json({ ok: true, view: await viewOf(deps, claim) });
  });

  app.get('/api/owner/:token', async (c) => {
    const deps = depsFor(c);
    if (await over(c, deps, 'read')) return tooMany(c);
    const claim = await lookup(c, deps, 'owner', c.req.param('token'));
    if (claim instanceof Response) return claim;
    return c.json({ ok: true, view: await viewOf(deps, claim) });
  });

  // The reviewer and the owner can both open the proofs of their own claim.
  for (const kind of ['review', 'owner'] as const) {
    app.get(`/api/${kind}/:token/files/:fileId`, async (c) => {
      const deps = depsFor(c);
      if (await over(c, deps, 'read')) return tooMany(c);
      const token = c.req.param('token');
      const fileId = c.req.param('fileId');
      let found: { mime: string; data: ArrayBuffer | Uint8Array } | null;
      if (kind === 'review' && token === SAMPLE_TOKEN) {
        const f = SAMPLE_FILES[fileId];
        found = f ? { mime: f.mime, data: f.bytes } : null;
      } else {
        const claim = await lookup(c, deps, kind, token);
        if (claim instanceof Response) return claim;
        found = await deps.claims.file(claim.id, fileId);
      }
      if (!found) return c.json({ ok: false, error: 'File not found.' }, 404);
      // A file is only ever shown, never run: no sniffing, and a sandbox if someone opens it directly.
      return new Response(found.data as BodyInit, {
        headers: {
          'Content-Type': found.mime === 'text/plain' ? 'text/plain; charset=utf-8' : found.mime,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
        },
      });
    });
  }

  app.put('/api/review/:token/items/:itemId', async (c) => {
    const deps = depsFor(c);
    if (await over(c, deps, 'read')) return tooMany(c);
    const token = c.req.param('token');
    if (token === SAMPLE_TOKEN) return c.json({ ok: false, error: 'The sample claim is not saved; your choices stay in this browser.' }, 403);
    const claim = await lookup(c, deps, 'review', token);
    if (claim instanceof Response) return claim;
    const itemId = c.req.param('itemId');
    if (!claim.payload.items.some((i) => i.id === itemId)) return c.json({ ok: false, error: 'No such item.' }, 404);
    const body = itemReviewBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: 'The decision was not understood.' }, 400);
    const written = await deps.claims.setReview(claim.id, { itemId, decision: body.data.decision, comment: body.data.comment }, deps.now().toISOString());
    if (written === 'locked') return c.json({ ok: false, error: 'This review is finished and can no longer be changed.' }, 409);
    return c.json({ ok: true });
  });

  app.post('/api/review/:token/decision', async (c) => {
    const deps = depsFor(c);
    if (await over(c, deps, 'read')) return tooMany(c);
    const token = c.req.param('token');
    if (token === SAMPLE_TOKEN) return c.json({ ok: false, error: 'The sample claim is not saved; your choices stay in this browser.' }, 403);
    const claim = await lookup(c, deps, 'review', token);
    if (claim instanceof Response) return claim;
    const body = finishBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ ok: false, error: 'The comment is too long.' }, 400);
    if (claim.status !== 'submitted' && claim.status !== 'in_review') return c.json({ ok: false, error: 'This review is already finished.' }, 409);
    const outcome = outcomeOf(claim.payload.items.map((i) => i.id), await deps.claims.reviews(claim.id));
    if (!outcome.ok) return c.json({ ok: false, error: 'Every item must be approved or rejected first.', undecided: outcome.undecided }, 422);
    const written = await deps.claims.finish(claim.id, outcome.status, body.data.comment, deps.now().toISOString());
    if (written === 'locked') return c.json({ ok: false, error: 'This review is already finished.' }, 409);
    return c.json({ ok: true, status: outcome.status });
  });

  return app;
}
