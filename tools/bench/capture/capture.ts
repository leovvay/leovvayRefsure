import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createOrcaBrowser } from '../../../src/browser';
import { newTrace } from '../../../src/output';
import { flags, list, need, num, opt } from '../../calibrate/lib/args';
import { appendJsonl } from '../../calibrate/lib/jsonl';
import { openTab } from '../../calibrate/lib/orca-tab';
import { readSet } from '../../calibrate/lib/set-file';
import { worktreeSelectorOf } from '../../calibrate/lib/worktree';
import { assertPinnedSource } from '../lib/freeze';
import { helpExit } from '../lib/help';
import type { CaptureItem } from './capture-item';
import { captureAll } from './capture-loop';
import { startMountServer } from './page-server';
import { readCaptureRow } from './read-set';
import { resumeFrom } from './resume';

/*
  P2 native capture of an authored set (protocol 3.1, 3.5): every page is served on 127.0.0.1 at its recorded path
  and read in one tab of the isolated Orca profile through refsure's own adapter and command steps; the site input
  each command would send becomes a bench item (`--out`); what code settles or the capture drops goes to
  `<out>.rows.jsonl` (X5: end-to-end slice only); counts to `<out>.meta.json`. `--parity N` runs the 3.5 parity
  checks on the first N asked items of each site through refsure's built CLI under `--cfgs` (cli_both = jev_gw);
  `--golden <dir>` also writes the outcome and option-map P0 golden pairs (jev_gw via cli_both, jev_or via cli_jevor).
  An item that throws (a transient Orca error) is a `capture_error` drop; 5 in a row end the run. `--resume` keeps
  the output files, skips the items already written and captures the `capture_error` ones again.

    capture --set <n*.jsonl> --out <items.jsonl> --profile <isolated profile id> [--ids a,b] [--limit N]
            [--port 8767] [--settle-ms 600] [--resume] [--parity N --cfgs <cfgs.json> --dist dist/refsure.mjs
            [--golden <dir> --golden-items <dir>]]

  Needs ORCA_WORKTREE_ID and, for parity, REFSURE_BENCH_ARMS. N12 is not captured (end-to-end only).
*/

const USAGE = 'usage: capture --set <set.jsonl> --out <items.jsonl> --profile <id> [--ids a,b] [--limit N] [--port 8767] '
  + '[--settle-ms 600] [--resume] [--parity N --cfgs <cfgs.json> --dist <refsure.mjs> [--golden <dir> --golden-items <dir>]]';
helpExit(USAGE);
const argv = process.argv.slice(2);
const resume = argv.includes('--resume');
const values = flags(argv.filter((a) => a !== '--resume'), ['set', 'out', 'profile', 'ids', 'limit', 'port', 'settle-ms', 'parity', 'cfgs', 'dist', 'golden', 'golden-items'], USAGE);
const setPath = need(values, 'set', USAGE);
const outPath = need(values, 'out', USAGE);
const profile = need(values, 'profile', USAGE);
const ids = new Set(list(values, 'ids', []));
const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });
const parity = num(values, 'parity', 0, USAGE, { min: 0, integer: true });
const commits = assertPinnedSource();

const set = readSet(setPath);
if (/^n12\b/.test(set.name)) throw new Error('N12 is end-to-end only (3.5): it is not captured');
const skipped: Record<string, number> = {};
const items: CaptureItem[] = [];
for (const row of set.rows) {
  if (ids.size > 0 && !ids.has(String(row.id))) continue;
  const read = readCaptureRow(row, set.name.replace(/\.jsonl$/, ''));
  if ('skip' in read) skipped[read.skip] = (skipped[read.skip] ?? 0) + 1;
  else items.push(read);
}
if (resume && opt(values, 'golden') !== undefined) throw new Error('--resume does not rewrite golden pairs: drop --golden');
const resumed = resume ? resumeFrom(outPath, items) : null;
if (resumed) process.stderr.write(`resume: ${resumed.done} items already written, ${resumed.retried} capture_error rows removed to retry\n`);
const todo = (resumed?.todo ?? items).slice(0, limit);
// Pages sit under the set's own directory (`sets/n2/pages/001.html`), as for tools/calibrate's refsure sets.
const own = join(dirname(setPath), set.name.split('.')[0] ?? '');
const root = existsSync(own) ? own : dirname(setPath);

const env = process.env;
const worktree = worktreeSelectorOf(env);
const server = await startMountServer(num(values, 'port', 8767, USAGE, { min: 1, max: 65535, integer: true }));
const blank = join(mkdtempSync(join(tmpdir(), 'refsure-capture-')), 'blank.html');
writeFileSync(blank, '<!doctype html><title>blank</title>');
const tab = await openTab(env, { url: server.mount('/__blank', blank), profile, worktree });
if (tab.profile === null) {
  await tab.close();
  await server.close();
  throw new Error(`Orca did not confirm profile ${profile} for the tab; refusing to open set pages in it`);
}
process.stderr.write(`${todo.length} items of ${set.name} on ${server.origin}, tab ${tab.pageId}\n`);
const deps = {
  browser: createOrcaBrowser({ env, trace: newTrace() }), tab, server, root,
  settleMs: num(values, 'settle-ms', 600, USAGE, { min: 0 }), piiMasks: true, worktree,
};
if (!resumed) {
  writeFileSync(outPath, '');
  writeFileSync(`${outPath}.rows.jsonl`, '');
}
try {
  const meta = await captureAll(todo, deps, {
    outPath, parity, cfgs: opt(values, 'cfgs'), dist: opt(values, 'dist'), golden: opt(values, 'golden'),
    goldenItems: opt(values, 'golden-items'), append: appendJsonl, resumed: resumed ?? undefined,
  });
  const summary = { set: set.name, sha256: set.sha256, rows: set.rows.length, read: items.length, captured: todo.length, skipped, ...(resumed ? { resumed: { done: resumed.done, retried: resumed.retried } } : {}), ...meta, ...commits, date: new Date().toISOString().slice(0, 10), profile: tab.profile, origin: server.origin };
  writeFileSync(`${outPath}.meta.json`, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (meta.aborted !== null) process.exitCode = 1;
} finally {
  await tab.close();
  await server.close();
}
