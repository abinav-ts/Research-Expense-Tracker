// Brand enforcement (REQ-BRAND-02, -03, -04; specs/07-branding.md). Runs inside `npm test`.
// Rules: no font-family or colour literals in client code outside src/client/brand/, no Google Fonts URLs,
// and the slogan appears exactly once, in the loading screen (index.html).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SLOGAN = 'Breeze through the grunt work of managing conference grant claims';

export interface SourceFile {
  /** Repo-relative path with forward slashes, e.g. "src/client/app/App.tsx". */
  path: string;
  content: string;
}
export interface Violation {
  rule: 'google-fonts' | 'font-family' | 'colour-literal' | 'slogan';
  path?: string;
  message: string;
}

const COLOUR_LITERAL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/i;
const inBrandDir = (path: string) => path.startsWith('src/client/brand/');
const isClientCode = (path: string) => path.startsWith('src/client/') && !inBrandDir(path);

export function checkBrand(files: SourceFile[]): Violation[] {
  const violations: Violation[] = [];
  const sloganAt: string[] = [];

  for (const { path, content } of files) {
    if (/fonts\.(googleapis|gstatic)\.com/.test(content)) {
      violations.push({ rule: 'google-fonts', path, message: 'Google Fonts URL (fonts are self-hosted, REQ-PRIV-05)' });
    }
    if (isClientCode(path) && /font-family|fontFamily/.test(content)) {
      violations.push({ rule: 'font-family', path, message: 'font-family outside src/client/brand/ (use the Tailwind font classes)' });
    }
    if ((isClientCode(path) || path === 'index.html') && COLOUR_LITERAL.test(content)) {
      violations.push({ rule: 'colour-literal', path, message: 'colour literal (use brand tokens / Tailwind theme colours)' });
    }
    for (let at = content.indexOf(SLOGAN); at !== -1; at = content.indexOf(SLOGAN, at + 1)) sloganAt.push(path);
  }

  if (sloganAt.length !== 1) {
    violations.push({ rule: 'slogan', message: `slogan must appear exactly once, found ${sloganAt.length}: ${sloganAt.join(', ') || 'nowhere'}` });
  } else if (sloganAt[0] !== 'index.html') {
    violations.push({ rule: 'slogan', path: sloganAt[0], message: 'slogan must live only in the loading screen (index.html)' });
  }
  return violations;
}

const TEXT_FILE = /\.(ts|tsx|css|html)$/;

function collect(dir: string, root: string, out: SourceFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, root, out);
    else if (TEXT_FILE.test(entry.name)) out.push({ path: relative(root, full).split(sep).join('/'), content: readFileSync(full, 'utf8') });
  }
}

/** Reads src/ and index.html from the repo root. */
export function loadRepoFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  collect(join(root, 'src'), root, files);
  files.push({ path: 'index.html', content: readFileSync(join(root, 'index.html'), 'utf8') });
  return files;
}

if (import.meta.main) {
  const violations = checkBrand(loadRepoFiles(join(import.meta.dirname, '..')));
  if (violations.length) {
    console.error('Brand check failed:');
    for (const v of violations) console.error(`  [${v.rule}] ${v.path ?? ''} ${v.message}`);
    process.exit(1);
  }
  console.log('Brand check passed.');
}
