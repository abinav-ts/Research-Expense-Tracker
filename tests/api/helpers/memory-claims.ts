import type { ItemReview } from '../../../src/shared/claim.ts';
import type { ClaimRepo, NewClaim, StoredClaim, StoredFile } from '../../../src/server/claims/repo.ts';

/** An in-memory ClaimRepo with the same rules as the D1 one, for API tests. */
export function memoryClaimRepo() {
  const claims = new Map<string, { claim: StoredClaim; reviewHash: string; ownerHash: string }>();
  const files = new Map<string, StoredFile>();
  const reviews = new Map<string, Map<string, ItemReview>>();
  const counters = new Map<string, number>();
  const open = (c: StoredClaim) => c.status === 'submitted' || c.status === 'in_review';

  const repo: ClaimRepo = {
    async create(claim: NewClaim, stored: StoredFile[]) {
      for (const e of claims.values()) {
        if (e.claim.idempotencyKey === claim.idempotencyKey) return e.reviewHash === claim.reviewHash && e.ownerHash === claim.ownerHash ? { result: 'duplicate' } : { result: 'conflict' };
      }
      claims.set(claim.id, { claim: { id: claim.id, idempotencyKey: claim.idempotencyKey, status: 'submitted', submittedAt: claim.submittedAt, payload: claim.payload }, reviewHash: claim.reviewHash, ownerHash: claim.ownerHash });
      for (const f of stored) files.set(`${claim.id}/${f.fileId}`, f);
      return { result: 'created' };
    },
    async findByReviewHash(hash) {
      return [...claims.values()].find((c) => c.reviewHash === hash)?.claim ?? null;
    },
    async findByOwnerHash(hash) {
      return [...claims.values()].find((c) => c.ownerHash === hash)?.claim ?? null;
    },
    async reviews(claimId) {
      return [...(reviews.get(claimId)?.values() ?? [])].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
    },
    async file(claimId, fileId) {
      const f = files.get(`${claimId}/${fileId}`);
      return f ? { mime: f.mime, data: f.data } : null;
    },
    async setReview(claimId, review) {
      const c = claims.get(claimId)?.claim;
      if (!c || !open(c)) return 'locked';
      const map = reviews.get(claimId) ?? new Map<string, ItemReview>();
      map.set(review.itemId, review);
      reviews.set(claimId, map);
      if (c.status === 'submitted') c.status = 'in_review';
      return 'ok';
    },
    async finish(claimId, status, comment, nowIso) {
      const c = claims.get(claimId)?.claim;
      if (!c || !open(c)) return 'locked';
      c.status = status;
      c.decidedAt = nowIso;
      if (comment) c.overallComment = comment;
      return 'ok';
    },
    async bump(bucket, window) {
      const key = `${bucket}/${window}`;
      counters.set(key, (counters.get(key) ?? 0) + 1);
      return counters.get(key)!;
    },
    async peek(bucket, window) {
      return counters.get(`${bucket}/${window}`) ?? 0;
    },
  };
  return Object.assign(repo, { _claims: claims, _files: files, _counters: counters });
}
