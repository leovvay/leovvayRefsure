import { readFileSync, writeFileSync } from 'node:fs';
import { familyOf, KNOWN_FAMILIES, SITES } from '../../src/questions';
import type { SiteId } from '../../src/questions';
import { flags, list, need, num, opt } from './lib/args';
import type { FitOptions } from './lib/fit-options';
import { entryFor, heldFor, masksFor, sameKey, setsOf } from './lib/fit-records';
import type { RecordContext } from './lib/fit-records';
import { fitSite } from './lib/fit-site';
import type { HeldRecord } from './lib/held-record';
import { readJsonl } from './lib/jsonl';
import type { MasksRecord } from './lib/masks-record';
import { nativeSummary, textOnlyOf } from './lib/native-summary';
import { type EntrySummary, summaryOf } from './lib/record-parts';
import type { RunRow } from './lib/run-row';
import { today } from './lib/set-file';
import type { SetMeta } from './lib/set-meta';
import type { ShippedEntry } from './lib/shipped-entry';

/*
  Calibration fit (steps 1 and 2). Reads runs-<site>.jsonl files and the sets' meta files and fits each site on
  every call given for it, pooled over sets and replays (lib/fit-site.ts). A site is `measured` only when the
  fit on all its labelled evidence ships a row: converted (step 1) and Orca-native (step 2) runs of one
  calibration key pool, and so do the calls on visual-only items, since refsure cannot tell such a page apart at
  run time. One report line per site carries the pooled fit, its Wilson lower bound, the per-set split, each
  replay's rows alone, and the readings that do not ship (native alone, native text-only).
  - With --write, a site that ships gets its Jev entry in calibration.json; one that does not gets a `held`
    record there (its evidence, why, and its readings), and refsure keeps its declared rows. --write refuses a
    site unless every set calibration.json already names for its key is given, so no evidence is dropped.
  - The --metas of a site and its answered runs name the same sets: a set with a meta but no answered run, or runs
    from a set with no meta, is refused, so a record never claims a set's evidence it did not fit.
  - --floor names the entries already shipped: their rows are starting rows, so nothing ships looser.
  - A site whose runs asked pages with PII masks on and off also gets the masks' own record under `masks`: the two
    modes on those pages, at the rows refsure acts on (spec §7.3). refsure reads only `entries`.

    fit --runs <a.jsonl,b.jsonl> --metas <a.meta.json,b.meta.json> [--write <calibration.json>] [--floor <calibration.json>]
        [--target 0.99] [--min-points 10] [--min-items 10] [--method isotonic|cumulative] [--route host] [--source text]
*/

const USAGE = 'usage: fit --runs <a.jsonl,b.jsonl> --metas <a.meta.json,b.meta.json> [--write <calibration.json>] [--floor <calibration.json>] [--target 0.99] [--min-points 10] [--min-items 10] [--method isotonic|cumulative] [--route host] [--source text]';
type Shipped = { version: number; entries: ShippedEntry[]; held?: HeldRecord[]; masks?: MasksRecord[] };
type Replay = { file: string; rows: RunRow[]; native: boolean };

const values = flags(process.argv.slice(2), ['runs', 'metas', 'write', 'floor', 'target', 'min-points', 'min-items', 'method', 'route', 'source'], USAGE);
const runFiles = list(values, 'runs', []);
if (runFiles.length === 0) need(values, 'runs', USAGE);
const metas = list(values, 'metas', []).map((path) => JSON.parse(readFileSync(path, 'utf8')) as SetMeta);
const method = values.method === 'cumulative' ? 'cumulative' : 'isotonic';
if (values.method !== undefined && values.method !== method) {
  process.stderr.write(`--method is isotonic or cumulative\n${USAGE}\n`);
  process.exit(64);
}
const opts: FitOptions = {
  target: num(values, 'target', 0.99, USAGE, { min: 0, max: 1 }),
  minPoints: num(values, 'min-points', 10, USAGE, { min: 1, integer: true }),
  minItems: num(values, 'min-items', 10, USAGE, { min: 1, integer: true }), method,
};
const route = opt(values, 'route') ?? 'openrouter.ai';
const source = opt(values, 'source');
const date = today();
const readShipped = (path: string | undefined): Shipped | undefined => (path === undefined ? undefined : JSON.parse(readFileSync(path, 'utf8')) as Shipped);
const floorFile = readShipped(opt(values, 'floor'));
const writePath = opt(values, 'write');
const writeFile = readShipped(writePath);
const nativeSets = new Set(metas.filter((meta) => meta.native !== undefined).map((meta) => meta.set));

/** Every file's rows, grouped by site; a file holds one site's runs, of one converted or native set. */
const bySite = new Map<SiteId, Replay[]>();
for (const file of runFiles) {
  const all = readJsonl<RunRow>(file);
  const site = all[0]?.site as SiteId | undefined;
  if (site === undefined) throw new Error(`${file} holds no runs`);
  if (all.some((row) => row.site !== site)) throw new Error(`${file} mixes sites; a runs file holds one site`);
  // Converted runs from before convert-v1 stamped the set carry no set name; the site's one converted set names them.
  const converted = metas.filter((meta) => meta.site === site && meta.native === undefined);
  const rows = all.map((row) => (row.set === undefined && converted.length === 1 ? { ...row, set: converted[0]!.set } : row));
  const native = rows.some((row) => row.set !== undefined && nativeSets.has(row.set));
  if (native && rows.some((row) => row.set === undefined || !nativeSets.has(row.set))) throw new Error(`${file} mixes converted and native runs`);
  bySite.set(site, [...(bySite.get(site) ?? []), { file, rows, native }]);
}

const ok = (row: RunRow) => row.status === 'ok';
const brief = (fit: ReturnType<typeof fitSite>) => ({ rows: fit.rows, acted: fit.acted, correct: fit.correct, why: fit.why });
const fresh: ShippedEntry[] = [];
const held: HeldRecord[] = [];
const masks: MasksRecord[] = [];
const refit = new Set<SiteId>();
for (const [site, replays] of bySite) {
  const sets = metas.filter((meta) => meta.site === site);
  if (sets.length === 0) throw new Error(`no --metas file for site ${site}`);
  const rows = replays.flatMap((replay) => replay.rows);
  const nativeRows = replays.filter((replay) => replay.native).flatMap((replay) => replay.rows);
  const answered = rows.filter(ok);
  const models = [...new Set(answered.map((row) => row.model ?? ''))];
  if (models.length !== 1 || familyOf(models[0]!) !== KNOWN_FAMILIES.jev) {
    throw new Error(`${site}: answered by ${models.join(', ')}; a fit needs one model of family ${KNOWN_FAMILIES.jev}`);
  }
  // A record names the metas' sets as its evidence, so they must be exactly the sets the answered runs came from.
  const runSets = new Set(answered.map((row) => row.set ?? ''));
  const unrun = sets.filter((meta) => !runSets.has(meta.set)).map((meta) => meta.set);
  if (unrun.length > 0) {
    throw new Error(`${site}: --metas names ${unrun.join(', ')} but --runs holds no answered call from it; pass its runs, or leave its meta out`);
  }
  const unnamed = [...runSets].filter((name) => !sets.some((meta) => meta.set === name));
  if (unnamed.length > 0) {
    const names = unnamed.map((name) => (name === '' ? 'runs that name no set (only a site\'s one converted set names those)' : name));
    throw new Error(`${site}: --runs holds answered calls from ${names.join(', ')} with no --metas file; pass its meta`);
  }
  if (writeFile !== undefined) {
    const recorded = [
      ...writeFile.entries, ...(writeFile.held ?? []), ...(writeFile.masks ?? []),
      ...(floorFile?.entries ?? []), ...(floorFile?.held ?? []), ...(floorFile?.masks ?? []),
    ].filter((record) => sameKey(record, site)).flatMap(setsOf);
    const missing = [...new Set(recorded)].filter((name) => !sets.some((meta) => meta.set === name));
    if (missing.length > 0) {
      throw new Error(`${site}: calibration.json holds evidence from ${missing.join(', ')}; pass its runs and meta, so the fit reads every labelled call for this key`);
    }
  }
  const floor = floorFile?.entries.find((entry) => sameKey(entry, site));
  const hasNative = nativeRows.length > 0;
  const siteOpts: FitOptions = { ...opts, native: hasNative, ...(floor === undefined ? {} : { floor: floor.threshold }) };
  const fit = fitSite(site, rows, siteOpts);
  const mixed = hasNative && nativeRows.length < rows.length;
  const nativeFit = mixed ? fitSite(site, nativeRows, siteOpts) : undefined;
  const visualOnlyCalls = nativeRows.filter((row) => row.visualOnly === true && ok(row)).length;
  const textFit = visualOnlyCalls === 0 ? undefined : fitSite(site, nativeRows.filter((row) => row.visualOnly !== true), siteOpts);
  const perReplay = replays.length < 2 ? undefined
    : replays.map((replay) => ({ file: replay.file, rows: fitSite(site, replay.rows, siteOpts).rows }));
  // A replay is one run of the items with its own calls; a site pools one file per set per replay.
  const filesPerSet = new Map<string, number>();
  for (const replay of replays) {
    for (const set of new Set(replay.rows.map((row) => row.set ?? ''))) filesPerSet.set(set, (filesPerSet.get(set) ?? 0) + 1);
  }
  const replayCount = Math.max(1, ...filesPerSet.values());
  const textOnly = textFit === undefined ? undefined : textOnlyOf(textFit, visualOnlyCalls);
  process.stdout.write(`${JSON.stringify({
    ...fit, replays: replayCount, floor: floor?.threshold ?? null, visualOnlyCalls,
    ...(nativeFit === undefined ? {} : { nativeAlone: brief(nativeFit) }),
    ...(textOnly === undefined ? {} : { textOnly }), ...(perReplay ? { perReplay } : {}),
  })}\n`);
  refit.add(site);
  const ctx: RecordContext = { opts, replays: replayCount, model: models[0]!, route, date, ...(source === undefined ? {} : { source }) };
  if (fit.maskModes !== undefined) {
    const maskReplays = Math.max(1, ...fit.maskModes.sets.map((set) => filesPerSet.get(set) ?? 0));
    masks.push(masksFor(site, fit.maskModes, sets, { ...ctx, replays: maskReplays }));
  }
  const nativeMetas = sets.filter((meta) => meta.native !== undefined);
  const nativeReading = !hasNative ? undefined
    : nativeSummary(nativeFit ?? fit, nativeRows.filter(ok), nativeMetas, { ...ctx, ...(textOnly === undefined ? {} : { textOnly }) });
  if (fit.threshold !== null) {
    const entry = entryFor(fit, answered, sets, ctx);
    if (nativeReading !== undefined) entry.provenance.native = nativeReading;
    if (floor !== undefined) entry.provenance.floor = summaryOf(floor);
    fresh.push(entry);
    continue;
  }
  const pooled = nativeReading !== undefined && !mixed ? nativeReading : nativeSummary(fit, answered, sets, ctx);
  // The entry this record replaces; a refit of a site already held keeps the one its record names.
  const shipped = writeFile?.entries.find((entry) => sameKey(entry, site)) ?? undefined;
  const heldBefore = writeFile?.held?.find((record) => sameKey(record, site))?.replaced;
  const replaced: EntrySummary | undefined = shipped !== undefined ? summaryOf(shipped)
    : heldBefore ?? (floor === undefined ? undefined : summaryOf(floor));
  held.push(heldFor(fit, pooled, ctx, {
    ...(mixed && nativeReading !== undefined ? { native: nativeReading } : {}), ...(replaced === undefined ? {} : { replaced }),
  }));
}

if (writePath !== undefined && writeFile !== undefined) {
  const keep = (record: ShippedEntry | HeldRecord | MasksRecord) => ![...refit].some((site) => sameKey(record, site));
  const order = Object.keys(SITES);
  const bySiteOrder = (a: { site: string }, b: { site: string }) => order.indexOf(a.site) - order.indexOf(b.site);
  const entries = [...writeFile.entries.filter(keep), ...fresh].sort(bySiteOrder);
  const heldAll = [...(writeFile.held ?? []).filter(keep), ...held].sort(bySiteOrder);
  const masksAll = [...(writeFile.masks ?? []).filter(keep), ...masks].sort(bySiteOrder);
  const out = { version: 1, entries, ...(heldAll.length === 0 ? {} : { held: heldAll }), ...(masksAll.length === 0 ? {} : { masks: masksAll }) };
  writeFileSync(writePath, `${JSON.stringify(out, null, 2)}\n`);
  process.stderr.write(`wrote ${entries.length} entries, ${heldAll.length} held sites and ${masksAll.length} masks records to ${writePath} `
    + `(${fresh.length + held.length} fitted now)\n`);
}
