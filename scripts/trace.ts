// Spec → test traceability (REQ-NFR-06). A test "covers" a requirement when its title contains the REQ ID.
//   npm run trace             fails if a requirement marked built/verified has no test, or a test cites an unknown ID
//   npm run trace -- --strict fails if ANY MUST requirement has no test (the M5 gate)
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Requirement {
  id: string;
  priority: 'M' | 'S' | 'C';
  title: string;
  /** From the "[built]" marker on the requirement's definition line, when it has one. */
  status?: 'draft' | 'agreed' | 'built' | 'verified';
}

export interface TraceResult {
  requirements: Requirement[];
  covered: Set<string>;
  /** Built/verified requirements with no test: always an error. */
  builtWithoutTest: Requirement[];
  /** MUST requirements with no test: an error only in strict mode. */
  mustWithoutTest: Requirement[];
  /** IDs cited in test titles that do not exist in the spec. */
  unknownIds: string[];
  failed: boolean;
}

const ID = /REQ-[A-Z]+-\d{2}/g;

/** Rows of the SPEC.md requirement index: | REQ-XXX-01 | Title | M | 01 | */
export function parseIndex(specMd: string): Requirement[] {
  const out: Requirement[] = [];
  for (const m of specMd.matchAll(/^\|\s*(REQ-[A-Z]+-\d{2})\s*\|\s*(.+?)\s*\|\s*([MSC])\s*\|/gm)) {
    out.push({ id: m[1]!, title: m[2]!, priority: m[3] as Requirement['priority'] });
  }
  return out;
}

/** Statuses from definition lines: "### REQ-X-01 — … [MUST] [built]" or "- **REQ-X-01** [built] …". */
export function parseStatuses(markdown: string): Map<string, Requirement['status']> {
  const out = new Map<string, Requirement['status']>();
  for (const line of markdown.split('\n')) {
    const def = line.match(/^###\s+(REQ-[A-Z]+-\d{2})\b/) ?? line.match(/^-\s+\*\*(REQ-[A-Z]+-\d{2})\*\*/);
    const status = line.match(/\[(draft|agreed|built|verified)\]/);
    if (def && status) out.set(def[1]!, status[1] as Requirement['status']);
  }
  return out;
}

/** REQ IDs found in the titles of it/test/describe calls (skipped and todo tests do not count). */
export function titleIds(testSource: string): string[] {
  const ids: string[] = [];
  const call = /\b(?:it|test|describe)((?:\.\w+)*)\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
  for (const m of testSource.matchAll(call)) {
    if (/\.(skip|todo)\b/.test(m[1]!)) continue;
    ids.push(...(m[3]!.match(ID) ?? []));
  }
  return ids;
}

export function trace(specMd: string, statusSources: string[], testSources: string[], strict: boolean): TraceResult {
  const statuses = new Map<string, Requirement['status']>();
  for (const source of [specMd, ...statusSources]) for (const [id, s] of parseStatuses(source)) statuses.set(id, s);

  const requirements = parseIndex(specMd).map((r) => {
    const status = statuses.get(r.id);
    return status ? { ...r, status } : r;
  });
  const known = new Set(requirements.map((r) => r.id));
  const covered = new Set(testSources.flatMap(titleIds));

  const builtWithoutTest = requirements.filter((r) => (r.status === 'built' || r.status === 'verified') && !covered.has(r.id));
  const mustWithoutTest = requirements.filter((r) => r.priority === 'M' && !covered.has(r.id));
  const unknownIds = [...covered].filter((id) => !known.has(id)).sort();
  const failed = builtWithoutTest.length > 0 || unknownIds.length > 0 || (strict && mustWithoutTest.length > 0);
  return { requirements, covered, builtWithoutTest, mustWithoutTest, unknownIds, failed };
}

function readTree(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) readTree(full, match, out);
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const strict = process.argv.includes('--strict');
  const specMd = readFileSync(join(root, 'SPEC.md'), 'utf8');
  const subSpecs = readTree(join(root, 'specs'), /\.md$/).map((f) => readFileSync(f, 'utf8'));
  const testFiles = readTree(join(root, 'tests'), /\.test\.tsx?$/);
  const result = trace(specMd, subSpecs, testFiles.map((f) => readFileSync(f, 'utf8')), strict);

  const musts = result.requirements.filter((r) => r.priority === 'M');
  const coveredMusts = musts.filter((r) => result.covered.has(r.id));
  console.log(`Test files scanned: ${testFiles.map((f) => relative(root, f)).join(', ') || 'none'}`);
  console.log(`MUST requirements with a test: ${coveredMusts.length}/${musts.length}`);
  for (const r of result.builtWithoutTest) console.error(`  ERROR ${r.id} is ${r.status} but no test title cites it`);
  for (const id of result.unknownIds) console.error(`  ERROR a test title cites ${id}, which is not in SPEC.md`);
  if (strict) for (const r of result.mustWithoutTest) console.error(`  ERROR MUST ${r.id} (${r.title}) has no test`);
  else if (result.mustWithoutTest.length) console.log(`  (${result.mustWithoutTest.length} MUSTs not yet tested; "npm run trace -- --strict" requires all)`);
  console.log(result.failed ? 'Trace FAILED.' : 'Trace passed.');
  process.exit(result.failed ? 1 : 0);
}
