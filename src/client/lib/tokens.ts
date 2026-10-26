// REQ-REV-07: 256-bit link tokens from the browser's secure random generator, written URL-safe (43 characters).
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newKey(): string {
  return crypto.randomUUID();
}
