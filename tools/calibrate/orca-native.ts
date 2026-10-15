import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createOrcaBrowser } from '../../src/browser';
import { loadConfig } from '../../src/config';
import { newTrace } from '../../src/output';
import { worktreeSelectorOf } from './lib/worktree';
import { flags, list, need, num, opt } from './lib/args';
import type { Captured } from './lib/captured';
import { appendJsonl } from './lib/jsonl';
import { captureItem } from './lib/native-capture';
import type { NativeCounts } from './lib/native-counts';
import type { NativeItem } from './lib/native-item';
import { openTab } from './lib/orca-tab';
import { startPageServer } from './lib/page-server';
import { readRefsureRow } from './lib/read-refsure-set';
import { readVisionRow } from './lib/read-vision-set';
import { readSet, today, writeSetMeta } from './lib/set-file';
import { inOverlayPlace } from './lib/v1-line';

/*
  Calibration step 2, the Orca-native replay (spec §9). Each stored page of a set is served on 127.0.0.1 and
  opened in one tab of an isolated Orca profile; refsure's own Orca adapter snapshots it, and the input its command
  would send is built from that snapshot (lib/native-inputs.ts). Gold is mapped onto the offered lines by role,
  name and ordinal. Items to ask go to --out, ready for run.ts; what code settles or the replay drops goes to
  <out>.rows.jsonl; counts and the set's sha256 go to <out>.meta.json for fit.ts.

    orca-native --set <set.jsonl> --out <captured.jsonl> --profile <isolated profile id> [--root <dir>]
                [--ids a,b] [--sources a,b] [--limit N] [--settle-ms 600]

  The set is a refsure set (`tools/calibrate/sets/<name>.jsonl`, pages under `<name>/`) or a frozen benchmark set
  whose items carry their stored page (pages relative to the set's directory). Needs ORCA_WORKTREE_ID.
*/

const USAGE = 'usage: orca-native --set <set.jsonl> --out <captured.jsonl> --profile <id> [--root <dir>] [--ids a,b] [--sources a,b] [--limit N] [--settle-ms 600]';
const values = flags(process.argv.slice(2), ['set', 'out', 'profile', 'root', 'ids', 'sources', 'limit', 'settle-ms'], USAGE);
const setPath = need(values, 'set', USAGE);
const outPath = need(values, 'out', USAGE);
const profile = need(values, 'profile', USAGE);
const ids = new Set(list(values, 'ids', []));
const sources = new Set(list(values, 'sources', ['synthetic', 'vision']));
const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });
const settleMs = num(values, 'settle-ms', 600, USAGE, { min: 0 });

const set = readSet(setPath);
const frozen = set.rows.some((row) => typeof row.task === 'string');
const root = opt(values, 'root') ?? (frozen ? dirname(setPath) : join(dirname(setPath), set.name.replace(/\.jsonl$/, '')));

const skipped: Record<string, number> = {};
const bump = (map: Record<string, number>, key: string) => { map[key] = (map[key] ?? 0) + 1; };
const items: NativeItem[] = [];
let droppedById = 0;
let droppedBySource = 0;
for (const row of set.rows) {
  const id = String(row.id);
  if (ids.size > 0 && !ids.has(id)) {
    droppedById += 1;
    continue;
  }
  const read = frozen
    ? readVisionRow(row as Parameters<typeof readVisionRow>[0], set.name)
    : readRefsureRow(row as Parameters<typeof readRefsureRow>[0], set.name);
  if ('skip' in read) bump(skipped, read.skip);
  else if (!sources.has(read.source)) {
    droppedBySource += 1;
    bump(skipped, `source ${read.source} not kept`);
  } else items.push(read);
}
const todo = items.slice(0, limit);
// Every capture keeps its item's site, so a mixed set is refused before any stored page is opened.
const sites = new Set(todo.map((item) => item.site));
if (sites.size > 1) throw new Error(`${set.name} holds items of several sites (${[...sites].join(', ')}); a set holds one site`);

const env = process.env;
const worktree = worktreeSelectorOf(env);
const config = loadConfig(env);
const server = await startPageServer();
const blank = join(mkdtempSync(join(tmpdir(), 'refsure-native-')), 'blank.html');
writeFileSync(blank, '<!doctype html><title>blank</title>');
const tab = await openTab(env, { url: server.mount('/__blank', blank), profile, worktree });
process.stderr.write(`${todo.length} items from ${set.name} on ${server.origin}, tab ${tab.pageId}, profile ${tab.profile ?? 'unconfirmed'}\n`);
if (tab.profile === null) {
  await tab.close();
  await server.close();
  throw new Error(`Orca did not confirm profile ${profile} for the tab; refusing to open stored pages in it`);
}
const deps = { browser: createOrcaBrowser({ env, trace: newTrace() }), tab, server, root, settleMs, piiMasks: config.piiMasks };

writeFileSync(outPath, '');
writeFileSync(`${outPath}.rows.jsonl`, '');
const counts: NativeCounts = {
  asked: 0, code: 0, codeCorrect: 0, dropped: {}, skipped, goldNotOffered: 0, profile: tab.profile,
  origin: frozen ? 'frozen' : 'refsure',
};
let lines = 0;
let overlayLines = 0;
try {
  for (const item of todo) {
    const results: Captured[] = await captureItem(item, deps);
    for (const result of results) {
      if (result.kind === 'ask') {
        appendJsonl(outPath, result.item);
        counts.asked += 1;
        if (result.goldNotOffered) counts.goldNotOffered += 1;
        const offered = 'lines' in result.item.input ? result.item.input.lines : [];
        lines += offered.length;
        overlayLines += offered.filter(inOverlayPlace).length;
      } else {
        appendJsonl(`${outPath}.rows.jsonl`, result.row);
        if (result.row.kind === 'code') {
          counts.code += 1;
          if (result.row.correct === true) counts.codeCorrect += 1;
        } else bump(counts.dropped, result.row.rule);
      }
    }
    const last = results.at(-1);
    process.stderr.write(`${item.id} ${last?.kind === 'ask' ? `ask gold=${last.item.gold}` : `${last?.row.kind} ${last?.row.rule}`}\n`);
  }
} finally {
  await tab.close();
  await server.close();
}

writeSetMeta(outPath, {
  set: set.name, sha256: set.sha256, site: [...sites][0] ?? 'none', items: set.rows.length, kept: counts.asked,
  droppedBySource, droppedById, lines, unparsedLines: 0, overlayLines, date: today(), native: counts,
});
