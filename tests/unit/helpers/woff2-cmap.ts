// Minimal WOFF2 reader: answers "does this font have a glyph for this code point?" by reading the cmap table.
// (cmap is never transformed in WOFF2, so it can be read straight from the Brotli-decompressed table stream.)
import { brotliDecompressSync } from 'node:zlib';

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc',
  'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

function readBase128(buf: Buffer, pos: { at: number }): number {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos.at++]!;
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error('bad UIntBase128');
}

function cmapTable(file: Buffer): Buffer {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  const pos = { at: 48 };
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[pos.at++]!;
    const index = flags & 0x3f;
    const tag = index === 0x3f ? file.toString('latin1', pos.at, (pos.at += 4)) : KNOWN_TAGS[index]!;
    const origLength = readBase128(file, pos);
    const version = flags >> 6;
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    tables.push({ tag, length: transformed ? readBase128(file, pos) : origLength });
  }
  const data = brotliDecompressSync(file.subarray(pos.at, pos.at + compressedSize));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === 'cmap') return data.subarray(offset, offset + t.length);
    offset += t.length;
  }
  throw new Error('no cmap table');
}

function format4Has(sub: Buffer, cp: number): boolean {
  const segCount = sub.readUInt16BE(6) / 2;
  const endBase = 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const rangeBase = deltaBase + segCount * 2;
  for (let i = 0; i < segCount; i++) {
    if (cp > sub.readUInt16BE(endBase + i * 2)) continue;
    const start = sub.readUInt16BE(startBase + i * 2);
    if (cp < start) return false;
    const rangeOffset = sub.readUInt16BE(rangeBase + i * 2);
    if (rangeOffset === 0) return ((cp + sub.readUInt16BE(deltaBase + i * 2)) & 0xffff) !== 0;
    return sub.readUInt16BE(rangeBase + i * 2 + rangeOffset + (cp - start) * 2) !== 0;
  }
  return false;
}

function format12Has(sub: Buffer, cp: number): boolean {
  const groups = sub.readUInt32BE(12);
  for (let i = 0; i < groups; i++) {
    const at = 16 + i * 12;
    if (cp >= sub.readUInt32BE(at) && cp <= sub.readUInt32BE(at + 4)) return true;
  }
  return false;
}

export function woff2HasGlyph(file: Buffer, codePoint: number): boolean {
  const cmap = cmapTable(file);
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i++) {
    const sub = cmap.subarray(cmap.readUInt32BE(4 + i * 8 + 4));
    const format = sub.readUInt16BE(0);
    if (format === 4 && format4Has(sub, codePoint)) return true;
    if (format === 12 && format12Has(sub, codePoint)) return true;
  }
  return false;
}
