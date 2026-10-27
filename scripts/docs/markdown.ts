// A small Markdown → HTML converter for the documentation pages (scripts/build-docs.ts). It is not part of the app.
// It covers what the viva sheet and the chat transcripts use: headings, paragraphs, bold/italic/strike, code,
// links, nested lists, tables, block quotes and rules. All text is HTML-escaped, so pasted transcripts cannot add markup.

export interface Heading {
  level: number;
  text: string;
  id: string;
}
export interface Rendered {
  html: string;
  headings: Heading[];
}
export interface RenderOptions {
  /** Give headings an id and a "#" link (the viva sheet's table of contents uses them). */
  headingIds?: boolean;
  /** Keep single line breaks inside a paragraph (typed prompts). */
  lineBreaks?: boolean;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- inline ----------

const SAFE_URL = /^(?:https?:\/\/|mailto:|#|\/|\.\.?\/|[\w.-]+(?:\/|#|$))/i;

/** Parks finished HTML behind a marker so later steps (escaping, emphasis) cannot touch it. */
function park(store: string[], html: string): string {
  store.push(html);
  return `\u0000${store.length - 1}\u0000`;
}

const link = (url: string, text: string) => `<a href="${escapeHtml(url)}">${text}</a>`;

function inline(raw: string, store: string[]): string {
  let s = raw.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_m, _ticks: string, code: string) => park(store, `<code>${escapeHtml(code.trim())}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (whole, text: string, url: string) =>
    SAFE_URL.test(url) ? park(store, link(url, inline(text, store))) : whole,
  );
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_m, url: string) => park(store, link(url, escapeHtml(url))));
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)'\]*_])/g, (_m, before: string, url: string) => before + park(store, link(url, escapeHtml(url))));
  s = escapeHtml(s);
  s = s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)__(?=\S)([\s\S]*?\S)__(?!\w)/g, '<strong>$1</strong>')
    .replace(/(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g, '<em>$1</em>')
    .replace(/(?<!\w)_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, '<em>$1</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  return s;
}

export function renderInline(raw: string, lineBreaks = false): string {
  const store: string[] = [];
  let html = inline(raw.replace(/\u0000/g, ''), store);
  html = lineBreaks ? html.replace(/\n/g, '<br>\n') : html.replace(/(?: {2,}|\\)\n/g, '<br>\n');
  for (let pass = 0; pass < 5 && /\u0000\d+\u0000/.test(html); pass++) {
    html = html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => store[Number(i)] ?? '');
  }
  return html;
}

// ---------- blocks ----------

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const INTERRUPTS_PARAGRAPH = /^ {0,3}(?:[-*+]|1[.)])\s+\S/;

interface Context {
  options: RenderOptions;
  headings: Heading[];
  usedIds: Map<string, number>;
}

const indentOf = (line: string) => line.length - line.trimStart().length;

function nextNonBlank(lines: string[], from: number): number {
  for (let j = from; j < lines.length; j++) if (lines[j]!.trim()) return j;
  return -1;
}

const isTableStart = (line: string, next: string | undefined) => line.includes('|') && next !== undefined && next.includes('-') && next.includes('|') && TABLE_SEP.test(next);

function startsBlock(line: string, next: string | undefined): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || INTERRUPTS_PARAGRAPH.test(line) || isTableStart(line, next);
}

function splitRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function slugFor(text: string, ctx: Context): string {
  const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '');
  const base = plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  const seen = ctx.usedIds.get(base) ?? 0;
  ctx.usedIds.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

function heading(level: number, text: string, ctx: Context): string {
  const html = renderInline(text);
  if (!ctx.options.headingIds) return `<h${level}>${html}</h${level}>`;
  const id = slugFor(text, ctx);
  ctx.headings.push({ level, text: text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, ''), id });
  return `<h${level} id="${id}">${html}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
}

function table(lines: string[], start: number): { html: string; next: number } {
  const head = splitRow(lines[start]!);
  const align = splitRow(lines[start + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
  const cell = (tag: string, text: string, col: number) => `<${tag}${align[col] ? ` style="text-align:${align[col]}"` : ''}>${renderInline(text)}</${tag}>`;
  let i = start + 2;
  const rows: string[] = [];
  while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) {
    rows.push(`<tr>${splitRow(lines[i]!).map((c, col) => cell('td', c, col)).join('')}</tr>`);
    i++;
  }
  const header = `<tr>${head.map((c, col) => cell('th', c, col)).join('')}</tr>`;
  return { html: `<div class="table-wrap"><table><thead>${header}</thead><tbody>${rows.join('')}</tbody></table></div>`, next: i };
}

function list(lines: string[], start: number, ctx: Context): { html: string; next: number } {
  const first = ITEM.exec(lines[start]!)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const startNumber = ordered ? parseInt(first[2]!, 10) : 1;
  const items: string[][] = [];
  let loose = false;
  let i = start;

  while (i < lines.length) {
    const m = ITEM.exec(lines[i]!);
    if (!m) break;
    const indent = m[1]!.length;
    if (indent < base || indent > base + 1 || /\d/.test(m[2]!) !== ordered) break;
    const contentIndent = indent + m[2]!.length + 1;
    const body: string[] = [m[3]!];
    i++;
    while (i < lines.length) {
      const line = lines[i]!;
      if (!line.trim()) {
        const j = nextNonBlank(lines, i);
        if (j === -1) { i = lines.length; break; }
        if (indentOf(lines[j]!) >= indent + 2) { // still inside this item
          for (; i < j; i++) body.push('');
          loose = true;
          continue;
        }
        const sibling = ITEM.exec(lines[j]!);
        if (sibling && sibling[1]!.length >= base && sibling[1]!.length <= base + 1) loose = true;
        i = j;
        break;
      }
      if (indentOf(line) >= indent + 2) {
        body.push(line.replace(new RegExp(`^ {0,${contentIndent}}`), ''));
        i++;
      } else if (ITEM.test(line) || startsBlock(line, lines[i + 1])) {
        break;
      } else {
        body.push(line.trim()); // a wrapped line of the item's paragraph
        i++;
      }
    }
    items.push(body);
  }

  const tag = ordered ? 'ol' : 'ul';
  const attr = ordered && startNumber !== 1 ? ` start="${startNumber}"` : '';
  const rendered = items.map((body) => {
    let inner = blocks(body, ctx);
    if (!loose) inner = inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
    return `<li>${inner}</li>`;
  });
  return { html: `<${tag}${attr}>${rendered.join('')}</${tag}>`, next: i };
}

function blocks(lines: string[], ctx: Context): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1]!;
      const closing = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closing.test(lines[i]!)) body.push(lines[i++]!);
      i++; // the closing fence (or the end of the text)
      const lang = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      out.push(heading(h[1]!.length, h[2]!, ctx));
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) inner.push(QUOTE.exec(lines[i]!)![1]!), i++;
      out.push(`<blockquote>${blocks(inner, ctx)}</blockquote>`);
      continue;
    }

    if (isTableStart(line, lines[i + 1])) {
      const t = table(lines, i);
      out.push(t.html);
      i = t.next;
      continue;
    }

    if (ITEM.test(line)) {
      const l = list(lines, i, ctx);
      out.push(l.html);
      i = l.next;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && (para.length === 0 || !startsBlock(lines[i]!, lines[i + 1]))) para.push(lines[i++]!.trimStart());
    out.push(`<p>${renderInline(para.join('\n'), ctx.options.lineBreaks)}</p>`);
  }
  return out.join('\n');
}

export function renderMarkdown(markdown: string, options: RenderOptions = {}): Rendered {
  const lines = markdown
    .replace(/^﻿/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\t+/, (tabs) => '    '.repeat(tabs.length)));
  const ctx: Context = { options, headings: [], usedIds: new Map() };
  return { html: blocks(lines, ctx), headings: ctx.headings };
}
