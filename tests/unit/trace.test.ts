import { describe, expect, it } from 'vitest';
import { parseIndex, parseStatuses, titleIds, trace } from '../../scripts/trace.ts';

const spec = `
| ID | Title | Pri | Spec |
|---|---|---|---|
| REQ-AAA-01 | A must | M | 01 |
| REQ-AAA-02 | A should | S | 01 |
| REQ-BBB-01 | B must | M | SPEC §9 |

- **REQ-BBB-01** [built] The system shall.
`;
// Fixture test sources are built by a helper so this file never contains literal "it('REQ-…')" text,
// which `npm run trace` would otherwise read as real test titles.
const call = (fn: string, id: string, quote = "'") => `${fn}(${quote}${id}: x${quote}, () => {})`;
const subSpec = '### REQ-AAA-01 — A must   [MUST] [agreed]\n### REQ-AAA-02 — A should   [SHOULD] [built]\n';

describe('REQ-NFR-06: every MUST has a test citing its ID (npm run trace)', () => {
  it('REQ-NFR-06: reads requirement IDs, priorities and titles from the SPEC.md index', () => {
    expect(parseIndex(spec).map((r) => [r.id, r.priority, r.title])).toEqual([
      ['REQ-AAA-01', 'M', 'A must'],
      ['REQ-AAA-02', 'S', 'A should'],
      ['REQ-BBB-01', 'M', 'B must'],
    ]);
  });

  it('REQ-NFR-06: reads statuses from sub-spec headings and SPEC bullets', () => {
    expect(parseStatuses(subSpec).get('REQ-AAA-02')).toBe('built');
    expect(parseStatuses(spec).get('REQ-BBB-01')).toBe('built');
  });

  it('REQ-NFR-06: finds IDs only in it/test/describe titles, not in bodies, skipped or todo tests', () => {
    const src = [
      `${call('it', 'REQ-AAA-01').slice(0, -1)} expect('REQ-AAA-02').toBe(1) })`,
      call('test', 'REQ-BBB-01', '`'),
      call('it.skip', 'REQ-AAA-02'),
    ].join('\n');
    expect(titleIds(src)).toEqual(['REQ-AAA-01', 'REQ-BBB-01']);
    expect(titleIds(call('it.todo', 'REQ-AAA-02'))).toEqual([]);
  });

  it('REQ-NFR-06: fails when a requirement marked built has no test', () => {
    const r = trace(spec, [subSpec], [call('it', 'REQ-AAA-01')], false);
    expect(r.builtWithoutTest.map((x) => x.id)).toEqual(['REQ-AAA-02', 'REQ-BBB-01']);
    expect(r.failed).toBe(true);
  });

  it('REQ-NFR-06: passes by default while unbuilt MUSTs are still untested, and fails in --strict', () => {
    const tests = [call('it', 'REQ-AAA-02'), call('it', 'REQ-BBB-01')];
    expect(trace(spec, [subSpec], tests, false).failed).toBe(false);
    const strict = trace(spec, [subSpec], tests, true);
    expect(strict.mustWithoutTest.map((x) => x.id)).toEqual(['REQ-AAA-01']);
    expect(strict.failed).toBe(true);
  });

  it('REQ-NFR-06: passes --strict once every MUST is covered', () => {
    const tests = ['REQ-AAA-01', 'REQ-AAA-02', 'REQ-BBB-01'].map((id) => call('it', id));
    expect(trace(spec, [subSpec], tests, true).failed).toBe(false);
  });

  it('REQ-NFR-06: fails when a test title cites an ID that is not in the spec (typo guard)', () => {
    const r = trace(spec, [subSpec], ['REQ-AAA-02', 'REQ-ZZZ-09', 'REQ-BBB-01'].map((id) => call('it', id)), false);
    expect(r.unknownIds).toEqual(['REQ-ZZZ-09']);
    expect(r.failed).toBe(true);
  });
});
