// REQ-CSV-01: turn the bytes of a chosen file into text, whatever the bank or Excel saved it as, or say plainly why not.
// Statements arrive as UTF-8 (with or without a byte-order mark), UTF-16 ("Unicode text" from Excel) or old Windows-1252.

export type Decoded = { ok: true; text: string; encoding: string } | { ok: false; error: string };

const startsWith = (bytes: Uint8Array, ...signature: number[]) => signature.every((b, i) => bytes[i] === b);

/** What a file really is, from its first bytes, for files that were renamed or exported in the wrong format. */
function notCsv(bytes: Uint8Array, name: string): string | undefined {
  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46)) return 'This is a PDF, not a CSV. In your bank\'s website or app choose the CSV or "Excel/CSV" download instead.';
  if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04)) return 'This is an Excel (.xlsx) file, not a CSV. Open it in Excel and use Save As → CSV, or choose the CSV download from your bank.';
  if (startsWith(bytes, 0xd0, 0xcf, 0x11, 0xe0)) return 'This is an old Excel (.xls) file, not a CSV. Open it in Excel and use Save As → CSV, or choose the CSV download from your bank.';
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47) || startsWith(bytes, 0xff, 0xd8, 0xff) || startsWith(bytes, 0x47, 0x49, 0x46)) return 'This is a picture, not a statement. Choose the CSV file from your bank.';
  if (/\.(xlsx?|pdf|docx?|png|jpe?g|heic)$/i.test(name)) return `"${name}" is not a CSV file. Choose the CSV download from your bank.`;
  return undefined;
}

export function decodeStatement(buffer: ArrayBuffer, name = ''): Decoded {
  const bytes = new Uint8Array(buffer);
  const wrong = notCsv(bytes, name);
  if (wrong) return { ok: false, error: wrong };
  if (bytes.length === 0) return { ok: false, error: 'This file is empty.' };

  if (startsWith(bytes, 0xff, 0xfe)) return { ok: true, text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  if (startsWith(bytes, 0xfe, 0xff)) return { ok: true, text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  // UTF-16 without a mark: every second byte is zero in a mostly-ASCII file.
  const sample = bytes.subarray(0, Math.min(bytes.length, 400));
  const zeros = sample.filter((b, i) => b === 0 && i % 2 === 1).length;
  if (sample.length >= 8 && zeros > sample.length / 4) return { ok: true, text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16' };

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    // Not valid UTF-8: older banks and Windows exports use Windows-1252 (every byte is some character, so this always decodes).
    return { ok: true, text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}
