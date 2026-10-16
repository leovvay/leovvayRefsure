import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCfgsFile } from '../e2e/cfgs';
import { armById, readArmsFile } from '../lib/arms';
import { type ArmRuntime, armRuntime } from '../lib/ask';
import type { BenchItem } from '../lib/items';
import { captureCandidates } from './candidates';
import type { CaptureItem } from './capture-item';
import { dropRow, type Emitted } from './emit';
import { captureOptionMap } from './option-map';
import { optionMapParity } from './option-map-parity';
import { captureOutcome } from './outcome';
import { outcomeParity } from './outcome-parity';
import type { Cli } from './parity';
import { CAPTURE_ERROR } from './resume';
import { siteParity } from './site-parity';
import type { BenchDeps } from './stored-page';
import { captureTextSite } from './text-sites';

export interface LoopOpts {
  outPath: string; parity: number; cfgs?: string | undefined; dist?: string | undefined;
  golden?: string | undefined; goldenItems?: string | undefined; append: (path: string, value: unknown) => void;
  /** `--resume`: parity already run per site (the parity file is kept, not truncated). */
  resumed?: { checked: Record<string, number> } | undefined;
}

/** Consecutive capture errors that end the run (a dead tab or Orca), so it does not drop the rest of the set. */
const MAX_CONSECUTIVE_ERRORS = 5;

const errorText = (e: unknown): string => String(e instanceof Error ? e.message : e).slice(0, 300);

/** calibrate's text-site capture already turns a throw into rule `capture_error: <message>`: one rule, the text in `error`. */
function oneErrorRule(results: Emitted[]): Emitted[] {
  for (const r of results) {
    if (r.kind === 'row' && r.row.rule.startsWith(`${CAPTURE_ERROR}: `)) {
      Object.assign(r.row, { error: r.row.rule.slice(CAPTURE_ERROR.length + 2) });
      r.row.rule = CAPTURE_ERROR;
    }
  }
  return results;
}

async function captureOne(item: CaptureItem, deps: BenchDeps): Promise<Emitted[]> {
  try {
    switch (item.site) {
      case 'presence': case 'page-state': return oneErrorRule(await captureTextSite(item, deps));
      case 'outcome': return oneErrorRule(await captureOutcome(item, deps));
      case 'option-map': return oneErrorRule(await captureOptionMap(item, deps));
      default: return oneErrorRule(await captureCandidates(item, deps));
    }
  } catch (e) {
    const drop = dropRow(item, CAPTURE_ERROR);
    if (drop.kind === 'row') Object.assign(drop.row, { error: errorText(e) });
    return [drop];
  }
}

type Arms = { gw: ArmRuntime; or: ArmRuntime; cli: Cli };

function armsFor(opts: LoopOpts): Arms | null {
  if (opts.parity === 0) return null;
  if (!opts.cfgs || !opts.dist) throw new Error('--parity needs --cfgs and --dist');
  const file = readArmsFile();
  return { gw: armRuntime(file, armById(file, 'jev_gw')), or: armRuntime(file, armById(file, 'jev_or')), cli: { cfgs: readCfgsFile(opts.cfgs), dist: opts.dist } };
}

/** Writes one golden pair (`<site>.<arm>.dry-run.json` beside `.body.json`) and its item, as P0 keeps them. */
const goldenWritten = new Set<string>();

function writeGolden(opts: LoopOpts, site: string, arm: string, g: { dry: string; body: string; item: BenchItem }): void {
  if (!opts.golden) return;
  goldenWritten.add(site);
  mkdirSync(opts.golden, { recursive: true });
  writeFileSync(join(opts.golden, `${site}.${arm}.dry-run.json`), g.dry);
  writeFileSync(join(opts.golden, `${site}.${arm}.body.json`), g.body);
  if (opts.goldenItems) {
    mkdirSync(opts.goldenItems, { recursive: true });
    writeFileSync(join(opts.goldenItems, `${site}.jsonl`), `${JSON.stringify(g.item)}\n`);
  }
}

const strip = <T extends { golden?: unknown }>({ golden: _g, ...row }: T): Omit<T, 'golden'> => row;

async function parityOf(cap: CaptureItem, item: BenchItem, deps: BenchDeps, arms: Arms, opts: LoopOpts, first: boolean): Promise<unknown[]> {
  if (cap.site === 'outcome') {
    const gw = await outcomeParity(cap, item, deps, arms.cli, 'cli_both', arms.gw, true);
    if (!first || !gw.golden) return [strip(gw)];
    const or = await outcomeParity(cap, item, deps, arms.cli, 'cli_jevor', arms.or, false);
    writeGolden(opts, 'outcome', 'jev_gw', gw.golden);
    if (or.golden) writeGolden(opts, 'outcome', 'jev_or', or.golden);
    return [strip(gw), strip(or)];
  }
  if (cap.site === 'option-map') {
    const gw = await optionMapParity(cap, item, deps, arms.cli, 'cli_both', arms.gw);
    if (!first || !gw.golden) return [strip(gw)];
    const or = await optionMapParity(cap, item, deps, arms.cli, 'cli_jevor', arms.or);
    writeGolden(opts, 'option-map', 'jev_gw', gw.golden);
    if (or.golden) writeGolden(opts, 'option-map', 'jev_or', or.golden);
    return [strip(gw), strip(or)];
  }
  return [await siteParity(cap, item, deps, arms.cli, 'cli_both', arms.gw)];
}

/** Captures every item in order, writes asks and rows, and runs parity on the first `parity` asks of each site. */
export async function captureAll(items: readonly CaptureItem[], deps: BenchDeps, opts: LoopOpts) {
  const arms = armsFor(opts);
  const counts = { asked: 0, code: 0, codeCorrect: 0, dropped: {} as Record<string, number>, goldNotOffered: 0, bySite: {} as Record<string, number> };
  const checked: Record<string, number> = { ...opts.resumed?.checked };
  const parityRows: unknown[] = [];
  let errors = 0;
  let aborted: string | null = null;
  if (arms && !opts.resumed) writeFileSync(`${opts.outPath}.parity.jsonl`, '');
  for (const cap of items) {
    const results = await captureOne(cap, deps);
    const failed = results.length === 1 && results[0]?.kind === 'row' && results[0].row.rule === CAPTURE_ERROR;
    errors = failed ? errors + 1 : 0;
    let asked: BenchItem | null = null;
    for (const r of results) {
      if (r.kind === 'ask') {
        opts.append(opts.outPath, r.item);
        counts.asked += 1;
        counts.bySite[r.item.site] = (counts.bySite[r.item.site] ?? 0) + 1;
        if (r.goldNotOffered) counts.goldNotOffered += 1;
        if (asked === null && r.item.masks !== false) asked = r.item;
      } else {
        opts.append(`${opts.outPath}.rows.jsonl`, r.row);
        if (r.row.kind === 'code') {
          counts.code += 1;
          if (r.row.correct === true) counts.codeCorrect += 1;
        } else counts.dropped[r.row.rule] = (counts.dropped[r.row.rule] ?? 0) + 1;
      }
    }
    const last = results.at(-1);
    process.stderr.write(`${cap.id} ${last?.kind === 'ask' ? `ask gold=${last.item.gold}` : `${last?.row.kind} ${last?.row.rule}`}${failed ? ` ${String((results[0] as { row?: { error?: unknown } }).row?.error)}` : ''}\n`);
    if (errors >= MAX_CONSECUTIVE_ERRORS) {
      aborted = `${errors} consecutive ${CAPTURE_ERROR} rows, last at ${cap.id}: rerun with --resume`;
      process.stderr.write(`${aborted}\n`);
      break;
    }
    const done = checked[cap.site] ?? 0;
    const ask = asked;
    if (arms && ask !== null && done < opts.parity) {
      checked[cap.site] = done + 1;
      const rows = await parityOf(cap, ask, deps, arms, opts, opts.golden !== undefined && !goldenWritten.has(cap.site))
        .catch((e: unknown) => [{ id: ask.id, arm: 'error', why: [`parity_error: ${errorText(e)}`] }]);
      for (const row of rows) opts.append(`${opts.outPath}.parity.jsonl`, row);
      parityRows.push(...rows);
      process.stderr.write(`  parity ${JSON.stringify(rows).slice(0, 400)}\n`);
    }
  }
  return { native: counts, parity: arms ? summarize(parityRows) : null, aborted };
}

function summarize(rows: readonly unknown[]): Record<string, unknown> {
  const out: Record<string, { n: number; equal: Record<string, number> }> = {};
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const cell = (out[String(row.arm)] ??= { n: 0, equal: {} });
    cell.n += 1;
    for (const key of ['equal', 'wrap', 'mark_before', 'mark_after', 'reread']) {
      if (row[key] === true) cell.equal[key] = (cell.equal[key] ?? 0) + 1;
    }
  }
  return out;
}
