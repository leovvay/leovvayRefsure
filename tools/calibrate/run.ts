import { flags, list, need, num } from './lib/args';
import { buildItem } from './lib/build-item';
import type { CalibItem } from './lib/calib-item';
import { jevAsker } from './lib/jev-asker';
import { appendJsonl, readJsonl } from './lib/jsonl';
import { pool } from './lib/pool';
import type { RunRow } from './lib/run-row';

/*
  Calibration replay (steps 1 and 2). Each converted or Orca-native item goes through refsure's own site `build`,
  the egress pipeline and the Jev provider, once per salt: candidate sites (locate, find, dismiss) in a differently
  shuffled order per salt, the others as plain repeats. An item that names its PII mask mode is approved in that
  mode. One row per call is appended to --out; a rerun skips (id, salt) pairs that already have an answer or an
  oversize refusal, so a killed run resumes. A refusal about setup (no consent grant yet) stops the run with exit 64
  and writes no row. A malformed number flag exits 64. OpenAI arms are not run here.

    run --in <items.jsonl> --out <runs-<site>.jsonl> [--salts s1,s2,s3] [--concurrency 6]
        [--deadline-ms 15000] [--attempts 3] [--max-usd 1] [--limit N]
*/

const USAGE = 'usage: run --in <items.jsonl> --out <runs.jsonl> [--salts s1,s2,s3] [--concurrency 6] [--deadline-ms 15000] [--attempts 3] [--max-usd 1] [--limit N]';
const values = flags(process.argv.slice(2), ['in', 'out', 'salts', 'concurrency', 'deadline-ms', 'attempts', 'max-usd', 'limit'], USAGE);
const inPath = need(values, 'in', USAGE);
const outPath = need(values, 'out', USAGE);
const salts = list(values, 'salts', ['s1', 's2', 's3']);
const concurrency = num(values, 'concurrency', 6, USAGE, { min: 1, integer: true });
const maxUsd = num(values, 'max-usd', 1, USAGE, { min: 0 });
const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });
const deadlineMs = num(values, 'deadline-ms', 15_000, USAGE, { min: 1 });
const attempts = num(values, 'attempts', 3, USAGE, { min: 1, integer: true });

/**
 * A refusal that is the item's own answer: its body is over the byte bounds, and stays so on every rerun. Any other
 * cause (no consent grant yet, an origin or spend rule) is about this machine's setup; the run stops on it and
 * writes no row, so a rerun after `refsure setup` asks the pair.
 */
const ITEM_REFUSALS: ReadonlySet<string> = new Set(['oversize']);

const all = readJsonl<CalibItem>(inPath);
if (all.length === 0) throw new Error(`${inPath} holds no items`);
const items = all.slice(0, limit);
const earlier = readJsonl<RunRow>(outPath, { optional: true });
const answered = (row: RunRow) => row.status === 'ok' || (row.status.startsWith('refused:') && ITEM_REFUSALS.has(row.status.slice('refused:'.length)));
const done = new Set(earlier.filter(answered).map((row) => `${row.id}\u0000${row.salt}`));
let spent = earlier.reduce((sum, row) => sum + (row.usd ?? 0), 0);

const asker = jevAsker({ deadlineMs, attempts });
const jobs = items.flatMap((item) => salts.map((salt) => ({ item, salt }))).filter(({ item, salt }) => !done.has(`${item.id}\u0000${salt}`));
process.stderr.write(`${jobs.length} calls to ${asker.host} (${asker.model}); ${done.size} already answered; $${spent.toFixed(4)} spent so far\n`);

const tally = { ok: 0, failed: 0, refused: 0 };
let stopped = false;
let setupRefusal = null as { cause: string; detail: string } | null;
let unpriced = false;
await pool(jobs, concurrency, async ({ item, salt }) => {
  if (stopped) return;
  if (spent >= maxUsd) {
    stopped = true;
    process.stderr.write(`stopped: $${spent.toFixed(4)} reached --max-usd ${maxUsd}\n`);
    return;
  }
  const built = buildItem(item, salt);
  const base = {
    id: item.id, site: item.site, salt, gold: item.gold, alt: item.alt, risk: item.risk, lang: item.lang,
    source: item.source, condition: item.condition, wording: built.wording, ts: new Date().toISOString(),
    ...(item.set === undefined ? {} : { set: item.set }), ...(item.masks === undefined ? {} : { masks: item.masks }),
    ...(item.visualOnly === true ? { visualOnly: true } : {}),
  };
  const approved = asker.approve(built.site, built.request, item.masks);
  if ('cause' in approved && !ITEM_REFUSALS.has(approved.cause)) {
    stopped = true;
    setupRefusal ??= approved;
    return;
  }
  if ('cause' in approved) {
    tally.refused += 1;
    const row: RunRow = {
      ...base, status: `refused:${approved.cause}`, choice: null, confidence: null, correct: null,
      model: null, usd: null, ms: 0, attempts: 0, digest: null,
    };
    appendJsonl(outPath, row);
    return;
  }
  const answer = await asker.ask(approved);
  spent += answer.usd ?? 0;
  if (answer.status === 'ok' && answer.usd === null && !unpriced) {
    unpriced = true;
    process.stderr.write(`warning: ${asker.host} answered with no cost, so --max-usd ${maxUsd} does not count those calls\n`);
  }
  const read = answer.status === 'ok' ? built.read(answer.answers?.[built.question]) : { choice: null, confidence: null };
  const truths = new Set([item.gold, ...item.alt]);
  const row: RunRow = {
    ...base, status: answer.status, choice: read.choice, confidence: read.confidence,
    ...(read.noul === undefined ? {} : { noul: read.noul }),
    correct: read.choice === null ? null : truths.has(read.choice),
    model: answer.model, usd: answer.usd, ms: answer.ms, attempts: answer.attempts, digest: answer.digest,
  };
  appendJsonl(outPath, row);
  if (answer.status === 'ok') tally.ok += 1;
  else tally.failed += 1;
});
process.stdout.write(`${JSON.stringify({ out: outPath, ...tally, usd: Number(spent.toFixed(6)) })}\n`);
if (setupRefusal !== null) {
  process.stderr.write(`stopped: refused:${setupRefusal.cause}: ${setupRefusal.detail}\nno row was written for it; rerun once that is fixed\n`);
  process.exit(64);
}
