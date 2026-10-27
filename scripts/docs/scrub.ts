// Removes secrets and personal identifiers from transcript text before it is published, and flags what it cannot
// decide for itself. The replacement rules are the same ones the transcript exporter in ~/Documents/claude-transcripts uses.

const RULES: { name: string; pattern: RegExp; replacement: string }[] = [
  { name: 'anthropic key', pattern: /sk-ant-[0-9A-Za-z_-]{20,}/g, replacement: '[REDACTED_KEY]' },
  { name: 'api key (sk-)', pattern: /\bsk-[0-9A-Za-z_-]{20,}/g, replacement: '[REDACTED_KEY]' },
  { name: 'google key', pattern: /AIza[0-9A-Za-z_-]{35}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  { name: 'github token', pattern: /\bgh[pousr]_[0-9A-Za-z]{30,}/g, replacement: '[REDACTED_GH_TOKEN]' },
  { name: 'bearer token', pattern: /bearer\s+[0-9A-Za-z._-]{20,}/gi, replacement: 'Bearer [REDACTED]' },
  {
    name: 'secret assignment',
    pattern: /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)\s*[=:]\s*['"]?(?!\[REDACTED)([^\s'"]{8,})/gi,
    replacement: '$1=[REDACTED]',
  },
  { name: 'session id', pattern: /\b(?:cse|session)_[0-9A-Za-z]{20,}/g, replacement: '[REDACTED_SESSION_ID]' },
  { name: 'email address', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  { name: 'scratch path', pattern: /\/private\/tmp\/claude-\d+\/[^\s'")]*/g, replacement: '[scratch]' },
  { name: 'home folder', pattern: /\/Users\/abinavts/g, replacement: '~' },
];

export type ScrubCounts = Map<string, number>;

export function scrub(text: string, counts: ScrubCounts): string {
  let out = text;
  for (const { name, pattern, replacement } of RULES) {
    out = out.replace(pattern, (...args) => {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      // String.replace expands $1 only for string replacements, so do it by hand for the function form.
      return replacement.replace(/\$(\d)/g, (_m, n: string) => String(args[Number(n)] ?? ''));
    });
  }
  return out;
}

// Things that look like bank or personal data. The project's fixtures are invented, so a hit is often fine; the build
// prints each one with its surroundings so a person can decide before publishing.
const SUSPECTS: { label: string; pattern: RegExp }[] = [
  { label: 'long number (account, card or UTR?)', pattern: /\b\d{10,}\b/g },
  { label: 'card ending digits', pattern: /\b(?:[Xx*•]{2,}|ending(?: in| with)?\s)\s?\d{4}\b/g },
  { label: 'IFSC code', pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { label: 'Indian mobile number', pattern: /(?<![\d.])(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)/g },
];

export interface Suspect {
  label: string;
  match: string;
  context: string;
}

export function findSuspects(text: string): Suspect[] {
  const found: Suspect[] = [];
  for (const { label, pattern } of SUSPECTS) {
    for (const m of text.matchAll(pattern)) {
      const at = m.index ?? 0;
      const context = text.slice(Math.max(0, at - 30), at + m[0].length + 30).replace(/\s+/g, ' ');
      found.push({ label, match: m[0], context });
    }
  }
  return found;
}
