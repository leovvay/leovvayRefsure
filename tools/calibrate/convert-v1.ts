import { writeFileSync } from 'node:fs';
import { flags, list, need } from './lib/args';
import type { CalibItem, CalibSite } from './lib/calib-item';
import { str } from './lib/coerce';
import { toLineV1 } from './lib/descriptor';
import { readSet, today, writeSetMeta } from './lib/set-file';
import type { SetItem } from './lib/set-item';
import { inOverlayPlace } from './lib/v1-line';

/*
  Calibration step 1, conversion. Reads one frozen benchmark set (JSONL, one labelled item per line) and writes
  refsure site inputs with every element line in line format v1. Locate (the recorded line and each candidate)
  and dismiss candidates are converted; page-state and outcome inputs pass unchanged.

    convert-v1 --set <set.jsonl> --out <converted.jsonl> [--sources a,b] [--drop id,id]

  Only items whose `source` is in --sources are kept (the default lists the public and synthetic sources the
  sets use); --drop removes named items. Every item carries its set's file name, so its runs name the set the fit
  pools them under. `<out>.meta.json` records the set's sha256 and the counts.
*/

const USAGE = 'usage: convert-v1 --set <set.jsonl> --out <converted.jsonl> [--sources a,b] [--drop id,id]';
const PUBLIC_SOURCES = ['drift', 'mutation', 'fixture', 'captured', 'authored', 'real', 'wayback', 'synthetic'];
const SITES: Readonly<Record<string, CalibSite>> = {
  browser_locate: 'locate', browser_dismiss: 'dismiss', browser_page_state: 'page-state', browser_outcome: 'outcome',
};

const counts = { lines: 0, unparsed: 0, overlay: 0 };

function v1(line: unknown): string {
  counts.lines += 1;
  const text = typeof line === 'string' ? line : '';
  const converted = toLineV1(text);
  if (converted !== null && inOverlayPlace(converted)) counts.overlay += 1;
  if (converted !== null) return converted;
  counts.unparsed += 1;
  return `generic ${JSON.stringify('')} in=""`;
}

function convert(item: SetItem, site: CalibSite, set: string): CalibItem {
  const r = item.request;
  const base = {
    id: item.id, base: item.base ?? item.id, lang: item.lang ?? 'en', source: item.source ?? '',
    condition: item.condition ?? '', gold: String(item.gold), alt: (item.alt ?? []).map(String),
    risk: typeof r.risk === 'string' ? r.risk : null, set,
  };
  const candidates = Array.isArray(r.candidates) ? r.candidates : [];
  switch (site) {
    case 'locate':
      return { ...base, site, input: { recorded: v1(r.recorded), intent: str(r.intent), lines: candidates.map(v1) } };
    case 'dismiss':
      return { ...base, site, input: { overlay: str(r.overlay), lines: candidates.map(v1) } };
    case 'page-state':
      return { ...base, site, input: { pageUrl: str(r.pageUrl), page: str(r.page), states: (r.states ?? {}) as Record<string, string> } };
    case 'outcome':
      return { ...base, site, input: { intent: str(r.intent), before: str(r.before), after: str(r.after) } };
    default:
      throw new Error(`${item.id}: site ${site} has no thinning conversion`);
  }
}

const values = flags(process.argv.slice(2), ['set', 'out', 'sources', 'drop'], USAGE);
const setPath = need(values, 'set', USAGE);
const outPath = need(values, 'out', USAGE);
const sources = new Set(list(values, 'sources', PUBLIC_SOURCES));
const drop = new Set(list(values, 'drop', []));

const set = readSet(setPath);
const items = set.rows as unknown as SetItem[];
let droppedBySource = 0;
let droppedById = 0;
const out: string[] = [];
let site: CalibSite | null = null;
for (const item of items) {
  const itemSite = SITES[item.task];
  if (itemSite === undefined) throw new Error(`${item.id}: task ${item.task} is not one of ${Object.keys(SITES).join(', ')}`);
  if (site !== null && itemSite !== site) throw new Error(`${item.id}: a set holds one site, saw ${site} and ${itemSite}`);
  site = itemSite;
  if (!sources.has(item.source ?? '')) {
    droppedBySource += 1;
    continue;
  }
  if (drop.has(item.id)) {
    droppedById += 1;
    continue;
  }
  out.push(JSON.stringify(convert(item, itemSite, set.name)));
}
writeFileSync(outPath, out.length > 0 ? `${out.join('\n')}\n` : '');
writeSetMeta(outPath, {
  set: set.name,
  sha256: set.sha256,
  site: site ?? 'none',
  items: items.length,
  kept: out.length,
  droppedBySource,
  droppedById,
  lines: counts.lines,
  unparsedLines: counts.unparsed,
  overlayLines: counts.overlay,
  date: today(),
});
