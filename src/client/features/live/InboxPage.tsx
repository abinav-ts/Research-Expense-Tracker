import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ACCEPTED_TYPES_TEXT, TOO_LARGE_NOTE } from '../../../shared/files.ts';
import { scrubReceiptText } from '../../../shared/receipt-parser.ts';
import { PROOF_TYPE_LABELS, type ProofType } from '../../../shared/types.ts';
import { SelectField, TextAreaField } from '../../components/fields.tsx';
import { Messages } from '../../components/Messages.tsx';
import { btn, btnPrimary, card, h1 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { queries } from '../../db/queries.ts';
import { attempt } from '../../lib/errors.ts';
import { convertHeicFiles } from '../../lib/heic.ts';
import { formatReceivedAt } from '../../lib/today.ts';
import { ensureOcrAssets } from '../../ocr/assets.ts';
import { OcrStatus } from '../../ocr/OcrStatus.tsx';
import { useLive } from '../../lib/useLive.ts';
import { ProofThumb } from './ProofView.tsx';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf,image/heic,image/heif';

/** REQ-CAP-02, -04, -13: add proofs (files, camera, pasted text) and review unconfirmed ones. */
export function InboxPage() {
  const items = useLive(() => queries.inboxList());
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [search] = useSearchParams();
  const shared = Number(search.get('shared') ?? 0);
  const skipped = Number(search.get('skipped') ?? 0);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  useEffect(() => void ensureOcrAssets(), []); // REQ-OFF-05: make sure screenshots can be read, offline too

  async function addFiles(list: FileList | null) {
    const picked = [...(list ?? [])];
    if (!picked.length) return; // picker cancelled: nothing changes
    await attempt(async () => {
      const converted = await convertHeicFiles(picked); // iPhone photos become JPEG here
      const result = converted.files.length ? await repo.addInboxFiles(converted.files) : { added: 0, messages: [] };
      setMessages([...converted.messages, ...result.messages]);
    });
  }

  return (
    <div>
      <h1 className={`${h1} mb-2`}>Inbox</h1>
      <p className="mb-4 text-ink-soft">Proofs waiting to become expenses: payment screenshots, card SMS text, invoices and tickets ({ACCEPTED_TYPES_TEXT}).</p>

      <input ref={files} type="file" multiple hidden accept={FILE_ACCEPT} aria-label="Choose proof files" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" aria-label="Take a photo of a proof" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
      <div className="mb-3 flex flex-wrap gap-3">
        <button type="button" className={btnPrimary} onClick={() => files.current?.click()}>Choose files</button>
        <button type="button" className={btn} onClick={() => camera.current?.click()}>Take photo</button>
        <button type="button" className={btn} onClick={() => setPasting((p) => !p)} aria-expanded={pasting}>Paste text</button>
      </div>
      <OcrStatus />
      <p className="mb-4 text-sm text-ink-soft">Tip: your phone's share sheet may not list ExpRes. Use Choose files, or copy the SMS and use Paste text.</p>

      {pasting && (
        <form
          className={`${card} mb-4`}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pasted.trim()) return;
            // Card digits and "available limit" figures are removed before anything is stored (REQ-CAP-13).
            if (await attempt(() => repo.addInboxText(scrubReceiptText(pasted)))) { setPasted(''); setPasting(false); }
          }}
        >
          <TextAreaField id="paste-text" label="Paste an SMS or payment notification" value={pasted} onChange={setPasted} rows={4} hint="Card numbers and available-limit figures are removed before saving." />
          <button type="submit" className={btnPrimary}>Add to Inbox</button>
        </form>
      )}

      {shared > 0 && <p role="status" className="my-3 font-semibold" data-testid="share-result">✓ {shared} {shared === 1 ? 'item' : 'items'} added from the share sheet.</p>}
      {skipped > 0 && <p role="status" className="my-3 text-sm font-semibold text-state-low">⚠ {skipped} shared {skipped === 1 ? 'file was' : 'files were'} skipped: use {ACCEPTED_TYPES_TEXT}.</p>}
      {search.get('error') === 'share' && <p role="alert" className="my-3 font-semibold text-state-over" data-testid="share-error">⚠ Nothing was saved from that share. Try again, or use Choose files / Paste text.</p>}
      <Messages messages={messages} />

      {!items ? <p role="status">Loading…</p> : items.length === 0 ? (
        <p className={`${card} text-ink-soft`} data-testid="inbox-empty">Nothing waiting. Add a screenshot, photo or pasted SMS above.</p>
      ) : (
        <ul className="grid gap-3" data-testid="inbox-list">
          {items.map((item) => (
            <li key={item.id} className={`${card} grid gap-3`} data-testid="inbox-item">
              {/* Row 1: thumbnail and what it is. Row 2: the controls. On a phone they never share a line, so the text keeps its width. */}
              <div className="flex items-start gap-3">
                {item.kind === 'file' ? <ProofThumb file={item} /> : <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-ground text-xs font-semibold text-ink-soft">SMS</span>}
                <div className="min-w-0 flex-1" data-testid="inbox-item-text">
                  <p className="line-clamp-3 font-semibold [overflow-wrap:anywhere]">{item.kind === 'file' ? item.name : item.text}</p>
                  <p className="text-sm text-ink-soft">{formatReceivedAt(item.receivedAt)}</p>
                  {item.tooLarge && <p className="text-sm font-semibold text-state-low">⚠ {TOO_LARGE_NOTE}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-x-3">
                <div className="min-w-44 flex-1">
                  <SelectField
                    id={`type-${item.id}`} label="Proof type" value={item.proofType ?? 'other'}
                    onChange={(v) => void attempt(() => repo.setInboxProofType(item.id, v as ProofType))}
                    options={(Object.keys(PROOF_TYPE_LABELS) as ProofType[]).map((t) => ({ value: t, label: PROOF_TYPE_LABELS[t] }))}
                  />
                </div>
                <Link to={`/inbox/${item.id}`} className={`${btnPrimary} mb-4`}>Review</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
