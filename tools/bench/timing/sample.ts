import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { SITES } from '../../../src/questions';
import type { SiteId } from '../../../src/questions';
import { holdsPrivateTerm } from '../lib/arms';
import type { ArmsFile } from '../lib/arms';
import { armRuntime, prepare } from '../lib/ask';
import { assertFrozen } from '../lib/freeze';
import type { FreezeEntry } from '../lib/freeze';
import { isCandidateSite, itemText, readItems } from '../lib/items';
import type { BenchItem } from '../lib/items';
import { BENCH_SEED, nearestRank, seeded, shuffleInPlace } from '../lib/stats';

/*
  4.3 timing sample, written once at P3a and frozen. Per site: the X4-clean items of the named frozen sets (only the
  items of that site), sorted by item id and split by gold class; k = 100 allocated to the strata by largest
  remainder; each stratum shuffled by Fisher-Yates over mulberry32(FNV-1a(`<seed>:<site>:<stratum>`)), its first
  k_stratum items taken. A site with fewer eligible items takes all of them. Gold class: on candidate sites `none`
  or `pick` (gold names a presented line); elsewhere the gold value itself. `find=<F1>` takes F1's locate items
  asked with their `intent` (input `{intent, lines}`, gold kept: the same lines in the same order), since find's
  frozen source is F1 (4.3); a locate item without an intent is excluded and counted.
*/

export const SAMPLE_SITES = Object.keys(SITES) as SiteId[];

export const SAMPLE_PER_SITE = 100;

/** One `site=path` source of the sample; only that site's items of the file are used. */
export interface SampleSource { site: SiteId; path: string; set: string; sha: string }

/** The items one source contributes, as its site asks them; `mapped` names the site they were mapped from. */
export function sourceItems(source: SampleSource): { items: BenchItem[]; mapped: 'locate' | null; noIntent: number } {
  const all = readItems(source.path);
  const own = all.filter((item) => item.site === source.site);
  if (own.length > 0) return { items: own, mapped: null, noIntent: 0 };
  const locate = source.site === 'find' ? all.filter((item) => item.site === 'locate') : [];
  if (locate.length === 0) throw new Error(`--from ${source.site}=${source.path}: the file holds no ${source.site} item${source.site === 'find' ? ' (and no locate item to ask with its intent)' : ''}`);
  const items: BenchItem[] = [];
  for (const item of locate) {
    if (item.site !== 'locate' || typeof item.input.intent !== 'string' || item.input.intent.trim() === '') continue;
    items.push({ ...item, site: 'find', input: { intent: item.input.intent, lines: item.input.lines } });
  }
  if (items.length === 0) throw new Error(`--from find=${source.path}: no locate item carries an intent`);
  return { items, mapped: 'locate', noIntent: locate.length - items.length };
}

export interface SampleItem { site: SiteId; set: string; set_sha: string; stratum: string; item: BenchItem }

export interface SiteDraw {
  eligible: number;
  x4_excluded: number;
  /** find from F1: locate items without an intent (not askable as find). */
  no_intent_excluded: number;
  k: number;
  /** Below 100 when the site had fewer eligible items (printed as the cell size). */
  cell_size: number;
  strata: Record<string, { eligible: number; k: number }>;
}

export interface TimingSample {
  v: 1;
  seed: string;
  created_at: string;
  arms_sha: string;
  sources: { site: SiteId; set: string; file: string; sha: string; mapped_from: 'locate' | null }[];
  sites: Record<string, SiteDraw>;
  /** Per site and arm: the sample's wire-body bytes (p0/fixed order), to print beside each quality set's. */
  req_bytes: Record<string, Record<string, BytesSummary>>;
  items: SampleItem[];
}

export interface BytesSummary { n: number; p50: number; p95: number; max: number; x4_withheld: number }

/** `site=path,site=path` -> sources, each checked against the freeze table. */
export function parseSources(spec: readonly string[], table: readonly FreezeEntry[] | null): SampleSource[] {
  return spec.map((entry) => {
    const at = entry.indexOf('=');
    if (at <= 0) throw new Error(`--from ${entry}: expected site=path`);
    const site = entry.slice(0, at) as SiteId;
    if (!SAMPLE_SITES.includes(site)) throw new Error(`--from ${entry}: ${site} is not a refsure site (${SAMPLE_SITES.join(', ')})`);
    const path = entry.slice(at + 1);
    const sha = table ? assertFrozen(table, path) : '';
    return { site, path, set: basename(path).replace(/\.jsonl(\.gz)?$/, ''), sha };
  });
}

/** Code-unit order: the same on every machine (no locale). */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function goldClass(item: BenchItem): string {
  if (isCandidateSite(item.site)) return item.gold === 'none' ? 'none' : 'pick';
  return item.gold;
}

/** Largest-remainder allocation of `k` over strata sizes; ties go to the stratum name that sorts first. */
export function allocate(sizes: Readonly<Record<string, number>>, k: number): Record<string, number> {
  const names = Object.keys(sizes).sort(cmp);
  const total = names.reduce((sum, name) => sum + sizes[name]!, 0);
  const out: Record<string, number> = {};
  if (total <= k) {
    for (const name of names) out[name] = sizes[name]!;
    return out;
  }
  const quotas = names.map((name) => ({ name, quota: (k * sizes[name]!) / total }));
  for (const { name, quota } of quotas) out[name] = Math.floor(quota);
  let left = k - names.reduce((sum, name) => sum + out[name]!, 0);
  const byRemainder = [...quotas].sort((a, b) => (b.quota - Math.floor(b.quota)) - (a.quota - Math.floor(a.quota)) || cmp(a.name, b.name));
  for (const { name } of byRemainder) {
    if (left <= 0) break;
    if (out[name]! < sizes[name]!) {
      out[name] = out[name]! + 1;
      left -= 1;
    }
  }
  return out;
}

/** The 4.3 draw over `sources` (X4 against the arms file's private terms); deterministic for the same inputs. */
export function drawSample(sources: readonly SampleSource[], arms: ArmsFile): { sites: Record<string, SiteDraw>; items: SampleItem[] } {
  const bySite = new Map<SiteId, { source: SampleSource; item: BenchItem }[]>();
  const x4 = new Map<SiteId, number>();
  const noIntent = new Map<SiteId, number>();
  for (const source of sources) {
    const from = sourceItems(source);
    noIntent.set(source.site, (noIntent.get(source.site) ?? 0) + from.noIntent);
    for (const item of from.items) {
      if (holdsPrivateTerm(arms, itemText(item))) {
        x4.set(source.site, (x4.get(source.site) ?? 0) + 1);
        continue;
      }
      bySite.set(source.site, [...(bySite.get(source.site) ?? []), { source, item }]);
    }
  }
  const sites: Record<string, SiteDraw> = {};
  const items: SampleItem[] = [];
  for (const site of [...bySite.keys()].sort()) {
    const eligible = [...bySite.get(site)!].sort((a, b) => cmp(a.item.id, b.item.id) || cmp(a.source.set, b.source.set));
    const strata = new Map<string, typeof eligible>();
    for (const entry of eligible) {
      const cls = goldClass(entry.item);
      strata.set(cls, [...(strata.get(cls) ?? []), entry]);
    }
    const sizes = Object.fromEntries([...strata].map(([cls, list]) => [cls, list.length]));
    const quota = allocate(sizes, SAMPLE_PER_SITE);
    const drawn: SiteDraw['strata'] = {};
    for (const cls of Object.keys(quota).sort()) {
      const pool = shuffleInPlace([...strata.get(cls)!], seeded(`${BENCH_SEED}:${site}:${cls}`));
      const take = pool.slice(0, quota[cls]!);
      drawn[cls] = { eligible: strata.get(cls)!.length, k: take.length };
      for (const { source, item } of take) items.push({ site, set: source.set, set_sha: source.sha, stratum: cls, item });
    }
    const k = Object.values(quota).reduce((sum, n) => sum + n, 0);
    sites[site] = { eligible: eligible.length, x4_excluded: x4.get(site) ?? 0, no_intent_excluded: noIntent.get(site) ?? 0, k, cell_size: k, strata: drawn };
  }
  return { sites, items };
}

/** Wire-body bytes per site and arm (`p0` on candidate sites, `fixed` elsewhere); X4 items are withheld from public arms. */
export function bytesBySite(items: readonly BenchItem[], arms: ArmsFile): Record<string, Record<string, BytesSummary>> {
  const out: Record<string, Record<string, BytesSummary>> = {};
  for (const arm of arms.arms) {
    const rt = armRuntime(arms, arm);
    const sizes = new Map<string, number[]>();
    const withheld = new Map<string, number>();
    for (const item of items) {
      if (arm.data === 'public' && holdsPrivateTerm(arms, itemText(item))) {
        withheld.set(item.site, (withheld.get(item.site) ?? 0) + 1);
        continue;
      }
      const p = prepare(rt, item, isCandidateSite(item.site) ? 'p0' : 'fixed');
      if (p.reqBytes !== null) sizes.set(item.site, [...(sizes.get(item.site) ?? []), p.reqBytes]);
    }
    for (const site of new Set([...sizes.keys(), ...withheld.keys()])) {
      const list = sizes.get(site) ?? [];
      out[site] ??= {};
      out[site]![arm.id] = {
        n: list.length, p50: nearestRank(list, 0.5), p95: nearestRank(list, 0.95), max: list.length ? Math.max(...list) : Number.NaN,
        x4_withheld: withheld.get(site) ?? 0,
      };
    }
  }
  return out;
}

/**
 * Draws the sample and writes it once; refuses to overwrite an existing sample file (it is frozen at P3a), and
 * refuses a draw missing any of the 7 sites unless `allowPartial` (a smoke or partial draw, never the frozen one).
 */
export function writeSample(path: string, sources: readonly SampleSource[], arms: ArmsFile, allowPartial = false): TimingSample {
  if (existsSync(path)) throw new Error(`${path} exists: the timing sample is written once (4.3)`);
  const missing = SAMPLE_SITES.filter((site) => !sources.some((source) => source.site === site));
  if (missing.length > 0 && !allowPartial) throw new Error(`--from names no source for ${missing.join(', ')}: the sample covers all 7 sites (4.3; --allow-partial for a smoke draw)`);
  const { sites, items } = drawSample(sources, arms);
  const sample: TimingSample = {
    v: 1, seed: BENCH_SEED, created_at: new Date().toISOString(), arms_sha: arms.sha,
    sources: sources.map((source) => ({ site: source.site, set: source.set, file: basename(source.path), sha: source.sha, mapped_from: sourceItems(source).mapped })),
    sites, req_bytes: bytesBySite(items.map((entry) => entry.item), arms), items,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sample)}\n`, { flag: 'wx' });
  return sample;
}
