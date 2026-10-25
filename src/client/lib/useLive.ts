import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Re-runs a Dexie query whenever the data it read changes. `undefined` = still loading; use null for "not found". */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
