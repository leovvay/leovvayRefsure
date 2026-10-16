import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  The 6.4 scenarios as one shape: E01-E21 from `e2e/scenarios.json` with their site2 scoring metadata
  (`fixtures/meta/site2.json`), E22-E33 from the frozen N12 set by id (its rows carry their own `allowed`, `writes`,
  `maxWrites`, `success`, steps and expected cells). Nothing here reads a page.
*/

export const CFGS = ['cli_both', 'cli_jev', 'cli_jevor', 'cli_oa'] as const;
export type CfgId = (typeof CFGS)[number];
export const BACKENDS = ['orca', 'agent-browser'] as const;
export type Backend = (typeof BACKENDS)[number];
export type Grade = 'pass' | 'safe' | 'fail';

export type RunWhen = 'always' | { ticket: number } | { ok: number[] } | { exit: [number, number[]] };
export interface RefSpec { role: string; name: string }
export interface Step { n: number; argv: string; run: RunWhen; refs?: Readonly<Record<string, RefSpec>> }

/** One envelope matcher; see `matchEnvelope` in grade.ts for what each key reads. */
export type Matcher = Readonly<Record<string, unknown>>;
export interface StepExpect { pass?: Matcher[]; safe?: Matcher[]; fail?: Matcher[] }
export interface ExpectLine { name?: string; fill?: string; value?: string; count: number | [number, number] }
export interface Cell {
  cell: Grade;
  steps: Readonly<Record<string, StepExpect | 'skipped'>>;
  /** Whether the fixture's success event must be reached (N12); absent on site2 scenarios. */
  success?: boolean;
  /** Expected click-log lines; `null` = no count check (the allowed/writes rules still apply). */
  lines: ExpectLine[] | null;
}

export interface AllowedLine { page?: string; line: 'button' | 'control' | 'fill'; name?: string; role?: string; field?: string; value?: string }
export interface Success { event: string; where?: Readonly<Record<string, unknown>> }

export interface Scenario {
  id: string;
  /** Path on the fixture server, e.g. `/site2/search.html`. */
  entry: string;
  steps: Step[];
  expect: Readonly<Record<CfgId, Cell>>;
  allowed: AllowedLine[];
  writes: { name: string }[];
  maxWrites: number;
  success: Success | null;
  /** `scenarios.json` or the N12 row id it came from. */
  source: string;
}

interface RawScenario { id: string; entry?: string; steps?: Step[]; expect?: Record<string, Cell | string>; n12?: string }
interface ScenarioFile { v: 1; seed: string; cfgs: string[]; backends: string[]; repeats: number; n12Set: string; siteMeta: string; scenarios: RawScenario[] }
interface PageMeta { allowed: AllowedLine[]; writes: { name: string }[]; maxWrites: number; success: Success | null }
interface N12Row { id: string; e: string; entry: string; allowed: AllowedLine[]; writes: { name: string }[]; maxWrites: number; success: Success; cli: { steps: Step[] }; expect: Record<string, Cell> }

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as T);
}

/** Resolves `"cli_jev": "cli_both"` references; a cycle or a missing cell throws. */
function cellsOf(id: string, raw: Record<string, Cell | string>): Record<CfgId, Cell> {
  const out = {} as Record<CfgId, Cell>;
  for (const cfg of CFGS) {
    let cell: Cell | string | undefined = raw[cfg];
    for (let hops = 0; typeof cell === 'string' && hops < CFGS.length; hops += 1) cell = raw[cell];
    if (cell === undefined || typeof cell === 'string') throw new Error(`${id}: no expected cell for ${cfg}`);
    out[cfg] = cell;
  }
  return out;
}

export interface ScenarioSet {
  seed: string;
  repeats: number;
  scenarios: Scenario[];
  /** Every repo-relative file the scenarios depend on (for the freeze check): scenarios, meta, N12 set. */
  files: string[];
}

/** Loads every scenario; `root` is the refsure repo root, `path` the scenarios file. */
export function loadScenarios(root: string, path: string): ScenarioSet {
  const file = JSON.parse(readFileSync(path, 'utf8')) as ScenarioFile;
  if (file.v !== 1) throw new Error(`${path}: v must be 1`);
  const meta = (JSON.parse(readFileSync(join(root, file.siteMeta), 'utf8')) as { pages: Record<string, PageMeta> }).pages;
  const n12 = new Map(readJsonl<N12Row>(join(root, file.n12Set)).map((row) => [row.id, row]));
  const scenarios = file.scenarios.map((raw): Scenario => {
    if (raw.n12 !== undefined) {
      const row = n12.get(raw.n12);
      if (row === undefined) throw new Error(`${raw.id}: N12 row ${raw.n12} is not in ${file.n12Set}`);
      if (row.e !== raw.id) throw new Error(`${raw.id}: N12 row ${raw.n12} is ${row.e}`);
      return {
        id: raw.id, entry: row.entry, steps: row.cli.steps, expect: cellsOf(raw.id, row.expect),
        allowed: row.allowed, writes: row.writes, maxWrites: row.maxWrites, success: row.success, source: row.id,
      };
    }
    if (raw.entry === undefined || raw.steps === undefined || raw.expect === undefined) {
      throw new Error(`${raw.id}: entry, steps and expect are required`);
    }
    const page = meta[raw.entry];
    if (page === undefined) throw new Error(`${raw.id}: ${raw.entry} has no scoring metadata in ${file.siteMeta}`);
    return {
      id: raw.id, entry: raw.entry, steps: raw.steps, expect: cellsOf(raw.id, raw.expect),
      allowed: page.allowed.map((line) => ({ page: raw.entry, ...line })), writes: page.writes,
      maxWrites: page.maxWrites, success: page.success, source: 'scenarios.json',
    };
  });
  const ids = new Set(scenarios.map((s) => s.id));
  if (ids.size !== scenarios.length) throw new Error(`${path}: duplicate scenario ids`);
  return { seed: file.seed, repeats: file.repeats, scenarios, files: [file.siteMeta, file.n12Set] };
}
