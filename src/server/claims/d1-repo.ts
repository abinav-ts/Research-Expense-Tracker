import { claimPayloadSchema, type ItemReview, type ClaimStatus } from '../../shared/claim.ts';
import type { ClaimRepo, NewClaim, StoredClaim, StoredFile } from './repo.ts';

interface ClaimRow {
  id: string;
  idempotency_key: string;
  status: string;
  submitted_at: string;
  decided_at: string | null;
  overall_comment: string | null;
  payload: string;
}

function toClaim(row: ClaimRow): StoredClaim {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    status: row.status as ClaimStatus,
    submittedAt: row.submitted_at,
    ...(row.decided_at && { decidedAt: row.decided_at }),
    ...(row.overall_comment && { overallComment: row.overall_comment }),
    payload: claimPayloadSchema.parse(JSON.parse(row.payload)),
  };
}

/** D1 may hand a BLOB back as an ArrayBuffer, a typed array or a plain array of numbers. */
function toBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]).buffer;
  throw new Error('unreadable file data');
}

/** A repeated Submit is a duplicate only when it is the very same claim: same links and same content. */
const same = (row: { review_hash: string; owner_hash: string; payload: string }, claim: NewClaim) =>
  row.review_hash === claim.reviewHash && row.owner_hash === claim.ownerHash && row.payload === JSON.stringify(claim.payload);

const COLUMNS = 'id, idempotency_key, status, submitted_at, decided_at, overall_comment, payload';

export function d1ClaimRepo(db: D1Database): ClaimRepo {
  const findBy = async (column: 'review_hash' | 'owner_hash', hash: string) => {
    const row = await db.prepare(`SELECT ${COLUMNS} FROM claims WHERE ${column} = ?1`).bind(hash).first<ClaimRow>();
    return row ? toClaim(row) : null;
  };
  return {
    async create(claim, files: StoredFile[]) {
      const existing = await db
        .prepare('SELECT review_hash, owner_hash, payload FROM claims WHERE idempotency_key = ?1')
        .bind(claim.idempotencyKey)
        .first<{ review_hash: string; owner_hash: string; payload: string }>();
      if (existing) return same(existing, claim) ? { result: 'duplicate' } : { result: 'conflict' };
      try {
        await db.batch([
          db
            .prepare('INSERT INTO claims (id, idempotency_key, review_hash, owner_hash, status, submitted_at, payload) VALUES (?1, ?2, ?3, ?4, \'submitted\', ?5, ?6)')
            .bind(claim.id, claim.idempotencyKey, claim.reviewHash, claim.ownerHash, claim.submittedAt, JSON.stringify(claim.payload)),
          ...files.map((f) =>
            db.prepare('INSERT INTO claim_files (claim_id, file_id, mime, size, sha256, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(claim.id, f.fileId, f.mime, f.size, f.sha256, f.data),
          ),
        ]);
      } catch (error) {
        // Two Submits with one key racing each other: the loser sees the winner's claim.
        const again = await db.prepare('SELECT review_hash, owner_hash, payload FROM claims WHERE idempotency_key = ?1').bind(claim.idempotencyKey).first<{ review_hash: string; owner_hash: string; payload: string }>();
        if (again) return same(again, claim) ? { result: 'duplicate' } : { result: 'conflict' };
        throw error;
      }
      return { result: 'created' };
    },
    findByReviewHash: (hash) => findBy('review_hash', hash),
    findByOwnerHash: (hash) => findBy('owner_hash', hash),
    async reviews(claimId) {
      const { results } = await db
        .prepare('SELECT item_id, decision, comment FROM item_reviews WHERE claim_id = ?1 ORDER BY item_id')
        .bind(claimId)
        .all<{ item_id: string; decision: string; comment: string }>();
      return results.map((r): ItemReview => ({ itemId: r.item_id, decision: r.decision as ItemReview['decision'], comment: r.comment }));
    },
    async file(claimId, fileId) {
      const row = await db.prepare('SELECT mime, data FROM claim_files WHERE claim_id = ?1 AND file_id = ?2').bind(claimId, fileId).first<{ mime: string; data: unknown }>();
      return row ? { mime: row.mime, data: toBuffer(row.data) } : null;
    },
    async setReview(claimId, review, nowIso) {
      const [write] = await db.batch([
        db
          .prepare(
            'INSERT INTO item_reviews (claim_id, item_id, decision, comment, updated_at) ' +
              'SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM claims WHERE id = ?1 AND status IN (\'submitted\', \'in_review\')) ' +
              'ON CONFLICT (claim_id, item_id) DO UPDATE SET decision = ?3, comment = ?4, updated_at = ?5',
          )
          .bind(claimId, review.itemId, review.decision, review.comment, nowIso),
        db.prepare('UPDATE claims SET status = \'in_review\' WHERE id = ?1 AND status = \'submitted\'').bind(claimId),
      ]);
      return write && write.meta.changes > 0 ? 'ok' : 'locked';
    },
    async finish(claimId, status, comment, nowIso) {
      const res = await db
        .prepare('UPDATE claims SET status = ?2, decided_at = ?3, overall_comment = ?4 WHERE id = ?1 AND status IN (\'submitted\', \'in_review\')')
        .bind(claimId, status, nowIso, comment)
        .run();
      return res.meta.changes > 0 ? 'ok' : 'locked';
    },
    async bump(bucket, window) {
      const row = await db
        .prepare('INSERT INTO rate_limits (bucket, window, hits) VALUES (?1, ?2, 1) ON CONFLICT (bucket, window) DO UPDATE SET hits = hits + 1 RETURNING hits')
        .bind(bucket, window)
        .first<{ hits: number }>();
      if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE window < ?1').bind(window - 60).run();
      return row?.hits ?? 1;
    },
    async peek(bucket, window) {
      const row = await db.prepare('SELECT hits FROM rate_limits WHERE bucket = ?1 AND window = ?2').bind(bucket, window).first<{ hits: number }>();
      return row?.hits ?? 0;
    },
  };
}
