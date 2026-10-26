// Small text-similarity helpers for forgiving matches against OCR output (REQ-CAP-15, REQ-CAP-16).

/** Lowercase words only: punctuation and spacing differences disappear. */
export function normaliseWords(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Edit distance (insert, delete, change one character). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

/** 1 = identical, 0 = nothing in common, after ignoring case and punctuation. */
export function similarity(a: string, b: string): number {
  const x = normaliseWords(a);
  const y = normaliseWords(b);
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 0 : 1 - editDistance(x, y) / longest;
}
