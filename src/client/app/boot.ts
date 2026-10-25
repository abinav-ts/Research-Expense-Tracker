// REQ-BRAND-04: the loading screen is plain HTML in index.html. It becomes visible after 300 ms (CSS delay);
// once visible it stays at least 700 ms, then fades out and is removed.
const SHOW_AFTER_MS = 300;
const MIN_VISIBLE_MS = 700;

export function finishLoading(): void {
  const el = document.getElementById('ex-loading');
  if (!el) return;
  const visibleFor = performance.now() - SHOW_AFTER_MS;
  const wait = visibleFor < 0 ? 0 : Math.max(0, MIN_VISIBLE_MS - visibleFor);
  window.setTimeout(() => {
    el.classList.add('ex-leaving');
    window.setTimeout(() => el.remove(), 200);
  }, wait);
}
