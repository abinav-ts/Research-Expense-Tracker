import { useSyncExternalStore } from 'react';
import { getOcrAssetState, subscribeOcrAssets } from './assets.ts';

const mb = (bytes: number) => (bytes / 1e6).toFixed(1);

/** REQ-OFF-05: "Recognition ready" or "Downloading recognition data (x MB)…". */
export function OcrStatus() {
  const s = useSyncExternalStore(subscribeOcrAssets, getOcrAssetState);
  const text =
    s.status === 'ready' ? '✓ Recognition ready'
    : s.status === 'downloading' ? `Downloading recognition data (${mb(s.loadedBytes)} of ${mb(s.totalBytes)} MB)…`
    : s.status === 'missing-offline' ? 'Recognition data is not downloaded yet. Connect once to get it; pasting text still works.'
    : s.status === 'error' ? `Recognition data could not be downloaded (${s.message}). Pasting text still works.`
    : '';
  return text ? <p role="status" className="mb-3 text-sm text-ink-soft" data-testid="ocr-status" data-state={s.status}>{text}</p> : null;
}
