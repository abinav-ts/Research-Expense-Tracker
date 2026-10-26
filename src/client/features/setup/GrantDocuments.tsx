import { useRef, useState } from 'react';
import { ACCEPTED_TYPES_TEXT, formatBytes, TOO_LARGE_NOTE, MAX_CLAIM_FILE_BYTES } from '../../../shared/files.ts';
import type { GrantDocument } from '../../../shared/types.ts';
import { ConfirmPanel } from '../../components/ConfirmPanel.tsx';
import { Messages } from '../../components/Messages.tsx';
import { btn, h2 } from '../../components/ui.ts';
import { repo } from '../../db/index.ts';
import { attempt } from '../../lib/errors.ts';
import { convertHeicFiles } from '../../lib/heic.ts';

/** REQ-SET-07: files are stored, listed, opened and removed. Nothing is read or recognised. */
export function GrantDocuments({ grantId, docs }: { grantId: string; docs: GrantDocument[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [removing, setRemoving] = useState<GrantDocument>();

  async function open(doc: GrantDocument) {
    const blob = await repo.getBlob(doc.blobKey);
    if (blob) window.open(URL.createObjectURL(blob), '_blank');
  }

  return (
    <section aria-labelledby="docs-heading" className="mt-8">
      <h2 id="docs-heading" className={`${h2} mb-2`}>Grant documents</h2>
      <p className="mb-3 text-sm text-ink-soft">Sanction letter, budget sheet and so on. They are only stored on this device ({ACCEPTED_TYPES_TEXT}); ExpRes never reads them.</p>
      <input
        ref={input} id="grant-doc-input" type="file" multiple hidden aria-label="Add grant documents"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          await attempt(async () => {
            const converted = await convertHeicFiles(files);
            const result = converted.files.length ? await repo.addGrantDocuments(grantId, converted.files) : { added: 0, messages: [] };
            setMessages([...converted.messages, ...result.messages]);
          });
        }}
      />
      <button type="button" className={btn} onClick={() => input.current?.click()}>Add documents</button>
      <Messages messages={messages} />
      {removing && (
        <ConfirmPanel
          message={`Remove "${removing.name}" from this device?`} confirmLabel="Remove"
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => { await attempt(() => repo.removeGrantDocument(removing.id)); setRemoving(undefined); }}
        />
      )}
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
        {docs.length === 0 && <li className="p-3 text-ink-soft">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3" data-testid="grant-doc">
            <span className="min-w-0 flex-1 font-semibold break-words">{d.name}</span>
            <span className="text-sm text-ink-soft">{d.mime.split('/')[1]?.toUpperCase()} · {formatBytes(d.sizeBytes)}</span>
            {d.sizeBytes > MAX_CLAIM_FILE_BYTES && <span className="w-full text-sm font-semibold text-state-low">⚠ {TOO_LARGE_NOTE}</span>}
            <button type="button" className={btn} onClick={() => open(d)}>Open</button>
            <button type="button" className={btn} onClick={() => setRemoving(d)} aria-label={`Remove ${d.name}`}>Remove</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
