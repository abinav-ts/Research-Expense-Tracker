// Turns the two kinds of transcript file into the same list of turns, then into HTML.
//  - a chat written as Markdown with speaker labels (the Cowork conversation), and
//  - the text file written by Claude Code's /export command (prompt lines, ⏺ lines for replies and tool calls).
// The build prints how many turns it found, so a file in an unexpected shape is noticed.
import { escapeHtml, renderMarkdown } from './markdown.ts';

export type Piece =
  | { kind: 'md'; text: string }
  | { kind: 'tool'; title: string; body: string }
  | { kind: 'note'; text: string };
export interface Turn {
  prompt: string;
  pieces: Piece[];
}
export interface ParsedTranscript {
  format: 'chat' | 'code' | 'unlabelled';
  header: string;
  turns: Turn[];
}

const trimBlank = (lines: string[]): string[] => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a]!.trim()) a++;
  while (b > a && !lines[b - 1]!.trim()) b--;
  return lines.slice(a, b);
};

// ---------- Claude Code /export ----------
// What the file looks like: a banner, then for each turn a prompt line (❯ text, or ! command for a shell command) whose
// wrapped lines are indented two spaces; replies start with ⏺ and are indented the same way; tool activity is collapsed into
// lines such as "Ran 3 shell commands (ctrl+o to expand)"; tool output follows a ⎿ mark; ✻ and ※ lines are timing and recap notes.

const PROMPT = /^(?:❯|>)(?: (.*))?$/;
const SHELL = /^! .+/;
const ASSISTANT = /^[⏺●](?: (.*))?$/;
const NOTE = /^[✻✶✽✢✳※] .+/;
const TOOL_HEAD = /^(?:[A-Z][A-Za-z]*\(|.+ \(MCP\))/;
const RESULT = /^\s*⎿\s*(.*)$/;
const SUMMARY = /^\s*(.*?)\s*\(ctrl\+o to expand\)\s*$/;
const NOISE = /^\s*· summary\s*$/;

export function looksLikeCodeExport(text: string): boolean {
  return /^(?:❯|>) \S/m.test(text) && /^[⏺●]/m.test(text);
}

/** Splits one reply into prose, collapsed tool summaries and tool output. */
function replyPieces(lines: string[]): Piece[] {
  const pieces: Piece[] = [];
  let buffer: string[] = [];
  const flushText = () => {
    const text = trimBlank(buffer);
    buffer = [];
    if (text.length === 0) return;
    if (TOOL_HEAD.test(text[0]!)) pieces.push({ kind: 'tool', title: text[0]!, body: text.slice(1).join('\n') });
    else pieces.push({ kind: 'md', text: text.join('\n') });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const summary = SUMMARY.exec(line);
    const result = RESULT.exec(line);
    if (NOISE.test(line)) continue;
    if (summary && !result) {
      flushText();
      pieces.push({ kind: 'note', text: summary[1]! });
    } else if (result) {
      flushText();
      const output = [result[1]!];
      while (i + 1 < lines.length && /^ {3,}\S/.test(lines[i + 1]!)) output.push(lines[++i]!.replace(/^ +/, ''));
      pieces.push(output.length === 1 && output[0]!.length <= 120 ? { kind: 'note', text: output[0]! } : { kind: 'tool', title: 'Output', body: output.join('\n') });
    } else buffer.push(line);
  }
  flushText();
  return pieces;
}

export function parseCodeExport(raw: string): ParsedTranscript {
  const header: string[] = [];
  const turns: Turn[] = [];
  let kind: 'header' | 'prompt' | 'reply' | 'note' = 'header';
  let current: string[] = [];

  const turn = (): Turn => {
    if (turns.length === 0) turns.push({ prompt: '', pieces: [] });
    return turns[turns.length - 1]!;
  };
  const flush = () => {
    const lines = trimBlank(current);
    current = [];
    if (lines.length === 0) return;
    if (kind === 'header') header.push(...lines);
    else if (kind === 'prompt') turns.push({ prompt: SHELL.test(lines[0]!) ? `\`\`\`\n${lines.join('\n')}\n\`\`\`` : lines.join('\n'), pieces: [] });
    else if (kind === 'note') turn().pieces.push({ kind: 'note', text: lines.join(' ') });
    else turn().pieces.push(...replyPieces(lines));
  };
  const start = (next: typeof kind, first: string) => {
    flush();
    kind = next;
    current = [first];
  };

  for (const rawLine of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, ''); // the terminal pads wrapped lines with spaces
    const prompt = PROMPT.exec(line);
    const reply = ASSISTANT.exec(line);
    if (prompt) start('prompt', prompt[1] ?? '');
    else if (SHELL.test(line)) start('prompt', line);
    else if (reply) start('reply', reply[1] ?? '');
    else if (NOTE.test(line)) start('note', line);
    else if (kind === 'header') current.push(line);
    else {
      const inner = line.replace(/^ {1,2}/, '');
      // Output of a command, or a collapsed tool summary, directly under a prompt belongs to the reply, not to the prompt.
      if (kind === 'prompt' && (RESULT.test(inner) || SUMMARY.test(inner))) start('reply', inner);
      else current.push(inner);
    }
  }
  flush();
  return { format: 'code', header: header.join('\n'), turns };
}

// ---------- chat written as Markdown ----------

const USER_NAMES = ['user', 'human', 'you', 'me', 'prompt'];
const CLAUDE_NAMES = ['assistant', 'claude', 'cowork', 'ai', 'response'];
const NAMES = [...USER_NAMES, ...CLAUDE_NAMES].join('|');
// Three label styles, so that an ordinary sentence or a document title is never taken for one:
//   "## User" / "### Human:"        a heading with nothing else on the line
//   "**User:** first words"          bold, the message may continue on the same line
//   "User: first words"              a plain label, the colon is required
const SPEAKER_STYLES = [
  new RegExp(`^#{1,6}\\s*(${NAMES})\\s*:?\\s*$`, 'i'),
  new RegExp(`^(?:\\*\\*|__)(${NAMES})\\s*:?\\s*(?:\\*\\*|__)\\s*:?\\s*(.*)$`, 'i'),
  new RegExp(`^(${NAMES})\\s*:\\s*(.*)$`, 'i'),
];
const TURN_HEADING = /^#{1,6}\s*turn\s+\d+\s*$/i;

function speakerLabel(line: string): { name: string; rest: string } | undefined {
  for (const style of SPEAKER_STYLES) {
    const m = style.exec(line.trim());
    if (m) return { name: m[1]!.toLowerCase(), rest: m[2] ?? '' };
  }
  return undefined;
}

export function parseChat(raw: string): ParsedTranscript {
  const turns: Turn[] = [];
  const preface: string[] = [];
  let speaker: 'user' | 'claude' | undefined;
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = trimBlank(current).join('\n');
    current = [];
    if (!speaker || !text) return;
    if (speaker === 'user') turns.push({ prompt: text, pieces: [] });
    else {
      if (turns.length === 0) turns.push({ prompt: '', pieces: [] });
      turns[turns.length - 1]!.pieces.push({ kind: 'md', text });
    }
  };

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const label = inFence ? undefined : speakerLabel(line);
    if (!inFence && TURN_HEADING.test(line.trim())) continue;
    if (label) {
      flush();
      speaker = USER_NAMES.includes(label.name) ? 'user' : 'claude';
      current = label.rest ? [label.rest] : [];
    } else if (speaker) current.push(line);
    else preface.push(line);
  }
  flush();
  return { format: turns.length > 0 ? 'chat' : 'unlabelled', header: trimBlank(preface).join('\n'), turns };
}

export function parseTranscript(raw: string): ParsedTranscript {
  return looksLikeCodeExport(raw) ? parseCodeExport(raw) : parseChat(raw);
}

// ---------- HTML ----------

const MAX_TOOL_LINES = 120;

function shorten(body: string): string {
  const lines = body.split('\n');
  if (lines.length <= MAX_TOOL_LINES) return body;
  return `${lines.slice(0, MAX_TOOL_LINES).join('\n')}\n… (${lines.length - MAX_TOOL_LINES} more lines left out)`;
}

function previewOf(pieces: Piece[]): string {
  const first = pieces.find((p): p is Extract<Piece, { kind: 'md' }> => p.kind === 'md');
  if (!first) return '';
  const lines = first.text
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[`*_#>~|[\]]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const plain = lines[0] && lines[0].length < 25 && lines[1] ? `${lines[0]} ${lines[1]}` : (lines[0] ?? '');
  return plain.length > 110 ? `${plain.slice(0, 110)}…` : plain;
}

function pieceHtml(piece: Piece): string {
  if (piece.kind === 'md') return `<div class="md">${renderMarkdown(piece.text).html}</div>`;
  if (piece.kind === 'note') return `<p class="note">${escapeHtml(piece.text)}</p>`;
  const body = piece.body.trim() ? `<pre>${escapeHtml(shorten(piece.body))}</pre>` : '<p class="note">(no output)</p>';
  return `<details class="tool"><summary><code>${escapeHtml(piece.title)}</code></summary>${body}</details>`;
}

/** `lineBreaks`: keep a typed prompt's own line breaks (a chat); a terminal export wraps lines itself, so it is off there. */
export function turnHtml(turn: Turn, id: string, label: string, lineBreaks: boolean): string {
  const prompt = turn.prompt
    ? `<div class="prompt"><div class="who">You</div>${renderMarkdown(turn.prompt, { lineBreaks }).html}</div>`
    : '';
  const tools = turn.pieces.filter((p) => p.kind === 'tool' || (p.kind === 'note' && !p.text.startsWith('✻') && !p.text.startsWith('※'))).length;
  const meta = tools ? `<span class="meta">${tools} tool step${tools === 1 ? '' : 's'}</span>` : '';
  const response = turn.pieces.length
    ? `<details class="response"><summary><span class="who">Claude</span><span class="preview">${escapeHtml(previewOf(turn.pieces))}</span>${meta}</summary>` +
      `<div class="response-body">${turn.pieces.map(pieceHtml).join('\n')}</div></details>`
    : '<p class="note">(no response recorded)</p>';
  return `<section class="turn" id="${id}"><h3 class="turn-head"><a href="#${id}">${escapeHtml(label)}</a></h3>${prompt}${response}</section>`;
}

/** Whatever came before the first turn: the Claude Code banner, or a title and notes above a pasted chat. */
export function headerHtml(parsed: ParsedTranscript): string {
  if (!parsed.header.trim()) return '';
  if (parsed.format === 'code') return `<details class="tool"><summary>Session header</summary><pre>${escapeHtml(parsed.header)}</pre></details>`;
  return `<div class="md">${renderMarkdown(parsed.header).html}</div>`;
}

export function unlabelledHtml(raw: string, asMarkdown: boolean): string {
  return asMarkdown ? `<div class="md">${renderMarkdown(raw).html}</div>` : `<pre class="raw">${escapeHtml(raw)}</pre>`;
}
