import { useEffect, useState } from 'react';
import { PROOF_TYPE_LABELS, type ProofType } from '../../../shared/types.ts';
import { repo } from '../../db/index.ts';
import { linkClass } from '../../components/ui.ts';
import { useBlobUrl } from './useBlobUrl.ts';

interface ProofFile {
  blobKey?: string | undefined;
  mime?: string | undefined;
  name?: string | undefined;
  proofType?: ProofType | undefined;
}

/** Small preview used in lists. */
export function ProofThumb({ file }: { file: ProofFile }) {
  const url = useBlobUrl(file.mime?.startsWith('image/') ? file.blobKey : undefined);
  if (url) return <img src={url} alt={`Proof: ${file.name ?? 'image'}`} className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />;
  return (
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-ground text-xs font-semibold text-ink-soft">
      {file.mime === 'application/pdf' ? 'PDF' : 'TXT'}
    </span>
  );
}

/** Full proof: image (tap to open full size, where pinch-zoom works), PDF link, or message text. */
export function ProofView({ file }: { file: ProofFile }) {
  const url = useBlobUrl(file.blobKey);
  const [text, setText] = useState<string>();
  const isText = file.mime === 'text/plain';
  useEffect(() => {
    if (!isText || !file.blobKey) return;
    void repo.getBlob(file.blobKey).then((b) => b?.text().then(setText));
  }, [isText, file.blobKey]);

  const label = file.proofType ? PROOF_TYPE_LABELS[file.proofType] : 'Proof';
  return (
    <figure className="mb-4" data-testid="proof-view">
      <figcaption className="mb-1 text-sm font-semibold text-ink-soft">{label}{file.name ? ` · ${file.name}` : ''}</figcaption>
      {isText && <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-3 text-sm whitespace-pre-wrap">{text ?? '…'}</pre>}
      {!isText && url && file.mime?.startsWith('image/') && (
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Proof: ${file.name ?? 'image'}`} className="max-h-96 w-full rounded-lg border border-line object-contain" /></a>
      )}
      {!isText && url && file.mime === 'application/pdf' && <a href={url} target="_blank" rel="noreferrer" className={linkClass}>Open PDF</a>}
    </figure>
  );
}
