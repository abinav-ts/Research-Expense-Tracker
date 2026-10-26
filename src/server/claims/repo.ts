// REQ-CLM-04, REQ-REV-01..03: what the server keeps, behind an interface (like HealthRepo) so API tests run without
// Cloudflare. Review and owner links are stored only as their SHA-256.
import type { ClaimPayload, ClaimStatus, ItemReview } from '../../shared/claim.ts';

export interface StoredClaim {
  id: string;
  idempotencyKey: string;
  status: ClaimStatus;
  submittedAt: string;
  decidedAt?: string;
  overallComment?: string;
  payload: ClaimPayload;
}

export interface NewClaim {
  id: string;
  idempotencyKey: string;
  reviewHash: string;
  ownerHash: string;
  submittedAt: string;
  payload: ClaimPayload;
}

export interface StoredFile {
  fileId: string;
  mime: string;
  size: number;
  sha256: string;
  data: ArrayBuffer;
}

export type CreateResult = { result: 'created' } | { result: 'duplicate' } | { result: 'conflict' };
export type WriteResult = 'ok' | 'locked';

export interface ClaimRepo {
  /** Stores a claim and its files together, or nothing. The same idempotency key with the same links is a duplicate. */
  create(claim: NewClaim, files: StoredFile[]): Promise<CreateResult>;
  findByReviewHash(hash: string): Promise<StoredClaim | null>;
  findByOwnerHash(hash: string): Promise<StoredClaim | null>;
  reviews(claimId: string): Promise<ItemReview[]>;
  file(claimId: string, fileId: string): Promise<{ mime: string; data: ArrayBuffer } | null>;
  /** Saves one item decision unless the claim is already decided; the first one moves it to "in review". */
  setReview(claimId: string, review: ItemReview, nowIso: string): Promise<WriteResult>;
  /** Records the overall decision once; later calls get 'locked'. */
  finish(claimId: string, status: 'approved' | 'partially_approved' | 'rejected', comment: string, nowIso: string): Promise<WriteResult>;
  /** Adds one to a counter for this minute and returns the new count. */
  bump(bucket: string, window: number): Promise<number>;
  /** The count so far, without adding. */
  peek(bucket: string, window: number): Promise<number>;
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}
export async function sha256Bytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
