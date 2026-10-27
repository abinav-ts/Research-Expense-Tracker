// REQ-CAP-01: the optional receipt on a cash expense: up to 5 files (photo, camera, PDF), checked and, for iPhone HEIC,
// converted as they are added. They are kept in memory until the expense is saved.
import { useRef, useState } from 'react';
import { ACCEPTED_TYPES_TEXT, checkFile, formatBytes } from '../../../shared/files.ts';
import { Messages } from '../../components/Messages.tsx';
import { btn } from '../../components/ui.ts';
import { convertHeicFiles } from '../../lib/heic.ts';

export const MAX_RECEIPTS = 5;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf,image/heic,image/heif';

export function ReceiptPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<string[]>([]);

  async function add(list: FileList | null) {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    const converted = await convertHeicFiles(picked);
    const notes = [...converted.messages];
    const next = [...files];
    for (const file of converted.files) {
      const check = checkFile(file);
      if (!check.ok) notes.push(check.message);
      else if (next.length >= MAX_RECEIPTS) notes.push(`"${file.name}" was not added: at most ${MAX_RECEIPTS} receipt files.`);
      else next.push(file);
    }
    setMessages(notes);
    onChange(next);
  }

  return (
    <fieldset className="mb-4 rounded-lg border border-line p-3" data-testid="receipt-picker">
      <legend className="px-1 text-sm font-semibold">Receipt (optional)</legend>
      <p className="mb-2 text-sm text-ink-soft">A photo or PDF of the receipt, {ACCEPTED_TYPES_TEXT}. Up to {MAX_RECEIPTS} files. It goes into the claim as proof.</p>
      <input ref={picker} type="file" multiple hidden accept={ACCEPT} aria-label="Choose receipt files" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" aria-label="Take a photo of the receipt" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn} onClick={() => picker.current?.click()}>Choose files</button>
        <button type="button" className={btn} onClick={() => camera.current?.click()}>Take photo</button>
      </div>
      <Messages messages={messages} />
      {files.length > 0 && (
        <ul className="mt-3 grid gap-2" data-testid="receipt-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3" data-testid="receipt-file">
              <span className="min-w-0 [overflow-wrap:anywhere]">{f.name} <span className="text-sm text-ink-soft">({formatBytes(f.size)})</span></span>
              <button type="button" className={btn} onClick={() => onChange(files.filter((_, n) => n !== i))} aria-label={`Remove ${f.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
