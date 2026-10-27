// Builds the viva site into docs/ for GitHub Pages (Settings → Pages → Deploy from a branch → main, /docs).
//   npm run docs
// Inputs (docs-src/):
//   viva-sheet.md                      the viva sheet, committed
//   transcripts/cowork.md              the Cowork conversation, Markdown with "User:" / "Claude:" labels
//   transcripts/code-m0.txt            the Milestone M0 session, saved with Claude Code's /export command
// Outputs (docs/): index.html, viva-sheet.html, transcript.html, assets/ (stylesheet and the app's self-hosted fonts).
// This is documentation tooling, not part of the app: it adds no dependency and no requirement. The raw transcripts stay
// out of git (see .gitignore) because only the scrubbed pages should ever be published.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { escapeHtml, renderMarkdown } from './docs/markdown.ts';
import { page, STYLES } from './docs/page.ts';
import { findSuspects, scrub, type ScrubCounts, type Suspect } from './docs/scrub.ts';
import { headerHtml, parseTranscript, turnHtml, unlabelledHtml } from './docs/transcript.ts';

const root = join(import.meta.dirname, '..');
const srcDir = join(root, 'docs-src');
const outDir = join(root, 'docs');
const assetsDir = join(outDir, 'assets');

const PARTS = [
  {
    id: 'cowork',
    file: 'cowork',
    title: 'Part 1 · Claude Cowork',
    blurb: 'The Claude Cowork conversation: the idea, the specification, the plan and the first brand designs.',
  },
  {
    id: 'code-m0',
    file: 'code-m0',
    title: 'Part 2 · Claude Code',
    blurb: 'The Claude Code session that built ExpRes: Milestone M0 (the walking skeleton defined in PLAN.md) first, then the later milestones.',
  },
];

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// ---------- stylesheet: brand tokens + the app's fonts + the page styles ----------

function buildAssets(): void {
  const tokens = readFileSync(join(root, 'brand/tokens.css'), 'utf8');
  const fontsPath = join(root, 'src/client/brand/fonts.css');
  const fonts = readFileSync(fontsPath, 'utf8').replace(/url\(([^)]+\.woff2)\)/g, (_m, rel: string) => {
    const file = resolve(dirname(fontsPath), rel);
    if (existsSync(file)) {
      mkdirSync(join(assetsDir, 'fonts'), { recursive: true });
      copyFileSync(file, join(assetsDir, 'fonts', basename(file)));
    } else console.warn(`  warning: font file not found (${basename(file)}); run "npm install". The pages will use system fonts.`);
    return `url(fonts/${basename(file)})`;
  });
  write(join(assetsDir, 'site.css'), `${tokens}\n${fonts}\n${STYLES}`);
}

// ---------- viva sheet ----------

function buildViva(): string {
  const source = readFileSync(join(srcDir, 'viva-sheet.md'), 'utf8');
  const { html, headings } = renderMarkdown(source, { headingIds: true });
  const toc =
    '<nav class="toc" aria-label="On this page"><strong>On this page</strong><ul>' +
    headings.filter((h) => h.level === 2).map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('') +
    '</ul></nav>';
  const title = headings.find((h) => h.level === 1)?.text ?? 'Viva sheet';
  write(
    join(outDir, 'viva-sheet.html'),
    page({
      title: `${title} · ExpRes`,
      description: 'ExpRes viva sheet: the idea, the stack, the on-device OCR and how it was made robust, and the decisions along the way.',
      nav: 'viva',
      body: html.replace('<h2', `${toc}\n<h2`),
    }),
  );
  return `viva-sheet.html (${headings.filter((h) => h.level === 2).length} sections)`;
}

// ---------- transcripts ----------

function findInput(base: string): string | undefined {
  for (const ext of ['md', 'txt', 'markdown']) {
    const path = join(srcDir, 'transcripts', `${base}.${ext}`);
    if (existsSync(path)) return path;
  }
  return undefined;
}

function buildTranscripts(counts: ScrubCounts): { summary: string[]; suspects: { part: string; item: Suspect }[] } {
  const summary: string[] = [];
  const suspects: { part: string; item: Suspect }[] = [];
  const sections: string[] = [];

  for (const part of PARTS) {
    const path = findInput(part.file);
    const head = `<h2 class="part-head" id="part-${part.id}">${escapeHtml(part.title)}</h2>`;
    if (!path) {
      sections.push(`${head}<p>${escapeHtml(part.blurb)}</p><p class="note">This transcript has not been added yet.</p>`);
      summary.push(`${part.title}: no file found (docs-src/transcripts/${part.file}.md or .txt), left as a placeholder`);
      continue;
    }
    const text = scrub(readFileSync(path, 'utf8'), counts);
    for (const item of findSuspects(text)) suspects.push({ part: part.title, item });

    const parsed = parseTranscript(text);
    let body: string;
    let detail: string;
    if (parsed.turns.length === 0) {
      body = `<p class="note">No speaker labels were found in this file, so it is shown as one document.</p>${unlabelledHtml(text, !path.endsWith('.txt'))}`;
      detail = 'no turns detected, shown as one document';
    } else {
      body = headerHtml(parsed) + parsed.turns.map((t, i) => turnHtml(t, `${part.id}-${i + 1}`, `Turn ${i + 1}`, parsed.format === 'chat')).join('\n');
      detail = `${parsed.turns.length} turns (${parsed.format} format)`;
    }
    sections.push(`${head}<p>${escapeHtml(part.blurb)}</p><p class="part-count">${escapeHtml(detail)}</p>${body}`);
    summary.push(`${part.title}: ${detail} from ${basename(path)}`);
  }

  const jump = PARTS.map((p, i) => `<a href="#part-${p.id}">Part ${i + 1}</a>`).join('');
  write(
    join(outDir, 'transcript.html'),
    page({
      title: 'Transcripts · ExpRes',
      description: 'The two conversations behind ExpRes: the Claude Cowork conversation and the Claude Code session that built the app.',
      nav: 'transcript',
      wide: true,
      body:
        '<h1>Transcripts</h1>' +
        '<p class="lead">The two conversations behind ExpRes, in the order they happened to be used: Claude Cowork, then Claude Code.</p>' +
        '<p class="meta-line">Secrets, e-mail addresses and home-folder paths were replaced before publishing. Each reply starts closed; tool calls are collapsed and very long output is shortened.</p>' +
        `<div class="toolbar"><button type="button" data-expand="all">Expand all</button><button type="button" data-expand="none">Collapse all</button>${jump}</div>` +
        sections.join('\n'),
    }),
  );
  return { summary, suspects };
}

// ---------- home ----------

function buildIndex(): void {
  write(
    join(outDir, 'index.html'),
    page({
      title: 'ExpRes · viva documents',
      description: 'Viva sheet and conversation transcripts for ExpRes, a privacy-first, offline-capable app for tracking and claiming conference-grant expenses.',
      nav: 'home',
      body:
        '<h1>ExpRes: viva documents</h1>' +
        '<p class="lead">ExpRes is a privacy-first, offline-capable web app for tracking and claiming conference-grant expenses. These pages hold the material for its viva.</p>' +
        '<div class="cards">' +
        '<a class="card" href="viva-sheet.html"><h2>Viva sheet</h2><p>The idea, the stack, the on-device OCR and how it was made robust, the decisions along the way, and likely questions.</p><p class="go">Read the sheet →</p></a>' +
        '<a class="card" href="transcript.html"><h2>Transcripts</h2><p>Part 1: the Claude Cowork conversation. Part 2: the Claude Code session that built the app, starting with Milestone M0.</p><p class="go">Read the transcripts →</p></a>' +
        '</div>',
    }),
  );
}

// ---------- run ----------

const counts: ScrubCounts = new Map();
console.log('Building docs/ ...');
buildAssets();
const viva = buildViva();
const { summary, suspects } = buildTranscripts(counts);
buildIndex();
write(join(outDir, '.nojekyll'), '');
write(join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

console.log(`  ${viva}`);
for (const line of summary) console.log(`  ${line}`);
console.log(`  replaced: ${counts.size ? [...counts].map(([name, n]) => `${n} × ${name}`).join(', ') : 'nothing needed replacing'}`);
if (suspects.length > 0) {
  console.log(`\nCheck before publishing: ${suspects.length} thing(s) in the transcripts look like personal or bank data.`);
  for (const { part, item } of suspects.slice(0, 20)) console.log(`  [${part}] ${item.label}: …${item.context}…`);
  if (suspects.length > 20) console.log(`  … and ${suspects.length - 20} more`);
  console.log('  Edit the raw file in docs-src/transcripts/ and run "npm run docs" again if any of these are real.');
}
console.log('\nDone. Open docs/index.html in a browser to look at it.');
