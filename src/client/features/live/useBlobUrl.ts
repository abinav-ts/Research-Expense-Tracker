import { useEffect, useState } from 'react';
import { repo } from '../../db/index.ts';

/** An object URL for a stored file; revoked when the component goes away. */
export function useBlobUrl(blobKey: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blobKey) return;
    let objectUrl: string | undefined;
    let cancelled = false;
    void repo.getBlob(blobKey).then((blob) => {
      if (blob && !cancelled) setUrl((objectUrl = URL.createObjectURL(blob)));
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobKey]);
  return url;
}
