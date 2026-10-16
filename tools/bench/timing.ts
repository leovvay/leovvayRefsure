import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { flags, list, need, num, opt } from '../calibrate/lib/args';
import { armById, readArmsFile } from './lib/arms';
import { armRuntime, askRow } from './lib/ask';
import { assertFrozen, readFreezeTable, sha256File } from './lib/freeze';
import { isCandidateSite, readItems } from './lib/items';
import type { BenchItem } from './lib/items';
import { measureRtt, timeKeySpawn } from './timing/gate';
import { cachedTokenCount, hit, parseCacheHit, readings } from './timing/readings';
import { bytesBySite, parseSources, sourceItems, writeSample } from './timing/sample';
import { runTiming } from './timing/run';
import { helpExit } from './lib/help';

/*
  Section 4 timing (P6) and its P0 pieces. Subcommands:

    timing sample   --from site=path[,site=path...] --freeze <table> --write <timing-sample.json> [--allow-partial]
                    P3a: the 4.3 draw, written once (refuses an existing file); also the sample's req_bytes per arm.
                    All 7 sites are required unless --allow-partial; `find=<F1>` asks F1's locate items by intent.
    timing bytes    --from site=path[,...] [--freeze <table>]
                    req_bytes per (site, arm) of any frozen set, to print beside the sample's.
    timing rtt      [--save <file>]          P0 (and ad hoc): median of 20 GETs per arms-file rttUrl; no key.
    timing key-spawn --argv '<json argv>' [--runs 20]
                    4.3: the spawn of a `command` key source timed alone; the value is dropped, never printed.
    timing cache-check --arm <id> --set <file> --item <id> [--freeze <table>] [--cache-hit name[=<regex>]]
                    P0 4.3: one body sent twice (2 paid calls); prints recorded headers and cached-token fields and
                    `cache_suspected`; exit 3 when suspected, 2 when it cannot decide (a send without an answer).
    timing run      --sample <file> --out <results> --rtt-baseline <P0 rtt file> [--freeze <table>] [--manifest <json>]
                    [--modes M1,M2] [--arms a,b] [--repeats 3] [--limit N] [--dry-run]
                    P6: M1 and M2 at concurrency 1, 5,000 ms per part, 1 attempt; start gate; RTT at the end.
    timing readings --out <results> --sample <file> [--modes M1,M2] [--arms a,b] [--repeats 3]
                    [--cache-hit name[=<regex>]] [--write <json>]
                    4.4 readings and the 4.5 exit check from the P6 ledgers against the planned cells (the arms
                    file's arms, or --arms, x the modes). Sends nothing. A cache-hit value matches ^(hit|true|1)$
                    (any case) unless a regex is given.

  Exit 3 = a guard stopped the run (cache-check: the response cache is suspected on); 2 = cache-check could not
  decide; 64 = bad usage.
*/

const USAGE = 'usage: timing sample|bytes|rtt|key-spawn|cache-check|run|readings [flags] (see the header of tools/bench/timing.ts)';
helpExit(USAGE);
const [command, ...rest] = process.argv.slice(2);

function fail(message: string, code = 64): never {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(code);
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<number> {
  switch (command) {
    case 'sample': {
      const allowPartial = rest.includes('--allow-partial');
      const v = flags(rest.filter((a) => a !== '--allow-partial'), ['from', 'freeze', 'write'], USAGE);
      const sources = parseSources(list(v, 'from', []), readFreezeTable(need(v, 'freeze', USAGE)));
      if (sources.length === 0) fail('missing --from');
      const sample = writeSample(need(v, 'write', USAGE), sources, readArmsFile(), allowPartial);
      print({ written: need(v, 'write', USAGE), sha256: sha256File(need(v, 'write', USAGE)), sites: sample.sites, req_bytes: sample.req_bytes });
      return 0;
    }
    case 'bytes': {
      const v = flags(rest, ['from', 'freeze'], USAGE);
      const freeze = opt(v, 'freeze');
      const sources = parseSources(list(v, 'from', []), freeze ? readFreezeTable(freeze) : null);
      const arms = readArmsFile();
      const out: Record<string, unknown> = {};
      for (const source of sources) {
        const { items } = sourceItems(source);
        out[`${source.set}:${source.site}`] = bytesBySite(items, arms)[source.site] ?? {};
      }
      print(out);
      return 0;
    }
    case 'rtt': {
      const v = flags(rest, ['save'], USAGE);
      const baseline = await measureRtt(readArmsFile());
      const save = opt(v, 'save');
      if (save) {
        mkdirSync(dirname(save), { recursive: true });
        writeFileSync(save, `${JSON.stringify(baseline, null, 2)}\n`, { flag: 'wx' });
      }
      print(baseline);
      return 0;
    }
    case 'key-spawn': {
      const v = flags(rest, ['argv', 'runs'], USAGE);
      const argv = JSON.parse(need(v, 'argv', USAGE)) as unknown;
      if (!Array.isArray(argv) || argv.length === 0 || !argv.every((part) => typeof part === 'string')) fail('--argv: a JSON array of strings');
      print(await timeKeySpawn(argv as string[], num(v, 'runs', 20, USAGE, { min: 1, max: 200, integer: true })));
      return 0;
    }
    case 'cache-check':
      return cacheCheck(rest);
    case 'run':
      return runTiming(rest, USAGE);
    case 'readings': {
      const v = flags(rest, ['out', 'sample', 'cache-hit', 'write', 'modes', 'arms', 'repeats'], USAGE);
      const modes = list(v, 'modes', ['M1', 'M2']);
      if (modes.length === 0 || modes.some((mode) => mode !== 'M1' && mode !== 'M2')) fail('--modes: M1, M2 or both');
      const arms = readArmsFile();
      const m1Arms = list(v, 'arms', arms.arms.map((arm) => arm.id)).map((id) => armById(arms, id).id);
      const result = readings({
        out: need(v, 'out', USAGE), sample: need(v, 'sample', USAGE), cacheHit: opt(v, 'cache-hit') ?? null,
        m1Arms, modes: modes as ('M1' | 'M2')[], repeats: num(v, 'repeats', 3, USAGE, { min: 1, max: 9, integer: true }),
      });
      const write = opt(v, 'write');
      if (write) {
        mkdirSync(dirname(write), { recursive: true });
        writeFileSync(write, `${JSON.stringify(result, null, 2)}\n`);
      }
      print(write ? { written: write, cells: result.cells.length, exit_check: result.exit_check } : result);
      return 0;
    }
    default:
      fail(`unknown subcommand ${command ?? '(none)'}`);
  }
}

/** Every numeric field under `usage` whose name says cached, with its path (cached-token fields, 4.3). */
export function cachedFields(usage: unknown, at = 'usage'): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof usage !== 'object' || usage === null) return out;
  for (const [name, value] of Object.entries(usage)) {
    if (typeof value === 'number' && /cache/i.test(name)) out[`${at}.${name}`] = value;
    else if (typeof value === 'object') Object.assign(out, cachedFields(value, `${at}.${name}`));
  }
  return out;
}

/**
 * 4.3 response-cache check (P0): the same approved body sent twice back to back on one arm. A response cache that
 * is on shows as a cache header on the second response, cached-token counts, or a second `T_wire` far below the
 * first; the arms file's `extraHeaders` must then turn it off before P6. Two paid calls; nothing is written.
 */
async function cacheCheck(args: readonly string[]): Promise<number> {
  const v = flags(args, ['arm', 'set', 'item', 'freeze', 'cache-hit'], USAGE);
  const rule = parseCacheHit(opt(v, 'cache-hit') ?? null);
  const arms = readArmsFile();
  const arm = armById(arms, need(v, 'arm', USAGE));
  const setPath = need(v, 'set', USAGE);
  const freeze = opt(v, 'freeze');
  const setSha = freeze ? assertFrozen(readFreezeTable(freeze), setPath) : sha256File(setPath);
  const item: BenchItem | undefined = readItems(setPath).find((candidate) => candidate.id === need(v, 'item', USAGE));
  if (!item) fail(`no item ${need(v, 'item', USAGE)} in ${setPath}`);
  const rt = armRuntime(arms, arm);
  const sends = [];
  for (const repeat of ['c1', 'c2']) {
    const row = await askRow(rt, item, {
      phase: 'P0', slice: 'final', set: 'cache-check', setSha, order: isCandidateSite(item.site) ? 'p0' : 'fixed', repeat,
      deadlineMs: 15_000, maxAttempts: 1, runId: 'cache-check', concurrency: 1, commits: { refsure_commit: '', bench_commit: '' },
    });
    const attempt = row.attempts[0];
    const usage = attempt?.usage ?? [];
    sends.push({
      repeat, status: row.status, digest: row.digest, t_wire: attempt?.t_wire ?? [], headers: attempt?.headers ?? [],
      cached: usage.map((u) => cachedFields(u)), cached_tokens: usage.reduce((sum: number, u) => sum + cachedTokenCount(u), 0),
    });
  }
  const [first, second] = sends as [(typeof sends)[number], (typeof sends)[number]];
  const sameBody = first.digest !== null && first.digest === second.digest;
  const wire1 = first.t_wire.at(-1);
  const wire2 = second.t_wire.at(-1);
  const reasons = [
    ...(hit(second.headers, rule) ? ['cache-hit header on c2'] : []),
    ...(second.cached_tokens > first.cached_tokens ? ['more cached tokens on c2 than c1'] : []),
    ...(wire1 !== undefined && wire2 !== undefined && wire2 < wire1 / 2 ? ['c2 T_wire under half of c1'] : []),
  ];
  // Undecided: a send without an answer or two different bodies cannot show the cache off.
  const decided = sameBody && first.status === 'ok' && second.status === 'ok';
  const suspected = reasons.length > 0;
  print({ arm: arm.id, same_body: sameBody, decided, cache_suspected: suspected, reasons, sends });
  if (suspected) return 3;
  return decided ? 0 : 2;
}

main().then((code) => process.exit(code), (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
