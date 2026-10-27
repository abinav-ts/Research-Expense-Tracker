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

// ---------- Claude Code /export ----------

const PROMPT = /^(?:❯|>)(?: (.*))?$/;
const ASSISTANT = /^[⏺●](?: (.*))?$/;
const NOTE = /^[✻✶✽✢✳] .+/;
const TOOL_HEAD = /^(?:[A-Z][A-Za-z]*\(|.+ \(MCP\))/;
const TOOL_RESULT = /^\s*⎿/;

export function looksLikeCodeExport(text: string): boolean {
  return /^(?:❯|>) \S/m.test(text) && /^[⏺●]/m.test(text);
}

const trimBlank = (lines: string[]): string[] => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a]!.trim()) a++;
  while (b > a && !lines[b - 1]!.trim()) b--;
  return lines.slice(a, b);
};

export function parseCodeExport(raw: string): ParsedTranscript {
  const header: string[] = [];
  const turns: Turn[] = [];
  let kind: 'header' | 'prompt' | 'assistant' = 'header';
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
    else if (kind === 'prompt') turns.push({ prompt: lines.join('\n'), pieces: [] });
    else if (TOOL_HEAD.test(lines[0]!) || lines.slice(1).some((l) => TOOL_RESULT.test(l))) {
      turn().pieces.push({ kind: 'tool', title: lines[0]!, body: lines.slice(1).join('\n') });
    } else turn().pieces.push({ kind: 'md', text: lines.join('\n') });
  };

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const prompt = PROMPT.exec(line);
    const reply = ASSISTANT.exec(line);
    if (prompt) {
      flush();
      kind = 'prompt';
      current = [prompt[1] ?? ''];
    } else if (reply) {
      flush();
      kind = 'assistant';
      current = [reply[1] ?? ''];
    } else if (NOTE.test(line)) {
      flush();
      if (kind !== 'header') turn().pieces.push({ kind: 'note', text: line });
      else header.push(line);
      current = [];
    } else {
      current.push(kind === 'header' ? line : line.replace(/^ {1,2}/, ''));
    }
  }
  flush();
  return { format: 'code', header: header.join('\n'), turns };
}

// ---------- chat written as Markdown ----------

const USER_NAMES = ['user', 'human', 'you', 'me', 'prompt'];
const CLAUDE_NAMES = ['assistant', 'claude', 'cowork', 'ai', 'response'];
const NAMES = [...USER_NAMES, ...CLAUDE_NAMES].join('|');
// "## User", "**User:**", "User:", "### Human:" … alone on a line or followed by the first words of the message.
const SPEAKER = new RegExp(`^(?:#{1,6}\\s*)?(?:\\*\\*|__)?(${NAMES})(?![\\w'’])(?:\\s*:)?(?:\\*\\*|__)?\\s*:?\\s*(.*)$`, 'i');
const TURN_HEADING = /^#{1,6}\s*turn\s+\d+\s*$/i;

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
    const label = inFence ? null : SPEAKER.exec(line.trim());
    // A label has to stand alone or be formatted (heading, bold, colon); a sentence that merely begins with "You" is not one.
    const formatted = label && (/^#{1,6}/.test(line.trim()) || /^(\*\*|__)/.test(line.trim()) || /^\w+\s*:/.test(line.trim()));
    if (!inFence && TURN_HEADING.test(line.trim())) continue;
    if (label && formatted) {
      flush();
      speaker = USER_NAMES.includes(label[1]!.toLowerCase()) ? 'user' : 'claude';
      current = label[2] ? [label[2]] : [];
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
  const plain = first.text.replace(/[`*_#>~|[\]]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 110 ? `${plain.slice(0, 110)}…` : plain;
}

function pieceHtml(piece: Piece): string {
  if (piece.kind === 'md') return `<div class="md">${renderMarkdown(piece.text).html}</div>`;
  if (piece.kind === 'note') return `<p class="note">${escapeHtml(piece.text)}</p>`;
  const body = piece.body.trim() ? `<pre>${escapeHtml(shorten(piece.body))}</pre>` : '<p class="note">(no output)</p>';
  return `<details class="tool"><summary><code>${escapeHtml(piece.title)}</code></summary>${body}</details>`;
}

export function turnHtml(turn: Turn, id: string, label: string): string {
  const prompt = turn.prompt
    ? `<div class="prompt"><div class="who">You</div>${renderMarkdown(turn.prompt, { lineBreaks: true }).html}</div>`
    : '';
  const tools = turn.pieces.filter((p) => p.kind === 'tool').length;
  const meta = tools ? `<span class="meta">${tools} tool call${tools === 1 ? '' : 's'}</span>` : '';
  const response = turn.pieces.length
    ? `<details class="response"><summary><span class="who">Claude</span><span class="preview">${escapeHtml(previewOf(turn.pieces))}</span>${meta}</summary>` +
      `<div class="response-body">${turn.pieces.map(pieceHtml).join('\n')}</div></details>`
    : '<p class="note">(no response recorded)</p>';
  return `<section class="turn" id="${id}"><h3 class="turn-head"><a href="#${id}">${escapeHtml(label)}</a></h3>${prompt}${response}</section>`;
}

export function unlabelledHtml(raw: string, asMarkdown: boolean): string {
  return asMarkdown ? `<div class="md">${renderMarkdown(raw).html}</div>` : `<pre class="raw">${escapeHtml(raw)}</pre>`;
}
