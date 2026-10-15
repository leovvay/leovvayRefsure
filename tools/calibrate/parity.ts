import { canonicalJson, sha256Hex } from '../../src/egress';
import type { DecisionAnswer, SiteId } from '../../src/questions';
import { flags, need, num } from './lib/args';
import { noulKey } from './lib/build-item';
import { jevAsker } from './lib/jev-asker';
import { appendJsonl, readJsonl } from './lib/jsonl';
import type { ParityItem } from './lib/parity-item';
import { pool } from './lib/pool';

/*
  Calibration step 0, parity. Sends frozen requests, byte for byte as they were sent before, through refsure's
  Jev provider (PII masks off, so the body is unchanged; the redaction pass still runs and any change is counted),
  and compares each answer with the one stored for the same request. Pass needs all three: every request answered,
  every body sent unchanged (byte for byte), and at least 90 % of Choice answers picking the same key.

    parity --in <parity-items.jsonl> --out <parity-runs.jsonl> [--concurrency 4] [--deadline-ms 15000]
*/

const USAGE = 'usage: parity --in <parity-items.jsonl> --out <parity-runs.jsonl> [--concurrency 4] [--deadline-ms 15000]';
const values = flags(process.argv.slice(2), ['in', 'out', 'concurrency', 'deadline-ms'], USAGE);
const inPath = need(values, 'in', USAGE);
const outPath = need(values, 'out', USAGE);
const SITE_IDS: Readonly<Record<string, SiteId>> = { page_state: 'page-state' };

const concurrency = num(values, 'concurrency', 4, USAGE, { min: 1, integer: true });
const deadlineMs = num(values, 'deadline-ms', 15_000, USAGE, { min: 1 });

const items = readJsonl<ParityItem>(inPath);
if (items.length === 0) throw new Error(`${inPath} holds no parity items`);
const asker = jevAsker({ deadlineMs, attempts: 3 });
process.stderr.write(`${items.length} parity requests to ${asker.host} (${asker.model})\n`);

function scoreOf(answer: DecisionAnswer | null | undefined): number | null {
  if (!answer) return null;
  return answer.type === 'choice' ? answer.confidence : answer.noul;
}

function keyOf(answer: DecisionAnswer | null | undefined): string | null {
  if (!answer) return null;
  return answer.type === 'choice' ? answer.choice : noulKey(answer.noul);
}

const rows = await pool(items, concurrency, async (item) => {
  const site = SITE_IDS[item.site] ?? (item.site as SiteId);
  const sentDigest = sha256Hex(canonicalJson({ state: item.state, questions: item.questions }));
  // PII masks off: the stored body is sent as it was sent before.
  const approved = asker.approve(site, { state: item.state, questions: item.questions }, false);
  if ('cause' in approved) {
    const row = { id: item.id, site: item.site, status: `refused:${approved.cause}`, detail: approved.detail };
    appendJsonl(outPath, row);
    return row;
  }
  const answer = await asker.ask(approved);
  const fresh = answer.answers?.[item.question] ?? null;
  const repeats = (item.storedRepeats ?? []).filter((r): r is DecisionAnswer => r !== null);
  const row = {
    id: item.id, site: item.site, kind: item.stored.type, status: answer.status,
    unchanged: approved.digest === sentDigest, model: answer.model, storedModel: item.storedModel ?? null,
    storedKey: keyOf(item.stored), freshKey: keyOf(fresh), same: fresh === null ? null : keyOf(fresh) === keyOf(item.stored),
    storedScore: scoreOf(item.stored), freshScore: scoreOf(fresh),
    delta: fresh === null ? null : Math.abs(scoreOf(fresh)! - scoreOf(item.stored)!),
    storedRepeatsSame: repeats.length === 0 ? null : repeats.every((r) => keyOf(r) === keyOf(item.stored)),
    usd: answer.usd, ms: answer.ms,
  };
  appendJsonl(outPath, row);
  return row;
});

const answered = rows.filter((row) => 'same' in row && row.same !== null) as Extract<(typeof rows)[number], { same: unknown }>[];
const summary = (kind: string) => {
  const part = answered.filter((row) => row.kind === kind);
  const deltas = part.map((row) => row.delta!).sort((a, b) => a - b);
  const same = part.filter((row) => row.same).length;
  return {
    n: part.length, same, rate: part.length === 0 ? null : Number((same / part.length).toFixed(4)),
    meanDelta: deltas.length === 0 ? null : Number((deltas.reduce((s, d) => s + d, 0) / deltas.length).toFixed(4)),
    medianDelta: deltas.length === 0 ? null : deltas[Math.floor(deltas.length / 2)],
    maxDelta: deltas.at(-1) ?? null,
  };
};
const choice = summary('choice');
const unchangedBodies = answered.filter((row) => row.unchanged).length;
const checks = {
  allAnswered: answered.length === items.length, bodiesUnchanged: unchangedBodies === answered.length,
  choiceAgrees: choice.rate !== null && choice.rate >= 0.9,
};
process.stdout.write(`${JSON.stringify({
  requests: items.length, answered: answered.length, unchangedBodies, choice, noul: summary('noul'), checks,
  pass: checks.allAnswered && checks.bodiesUnchanged && checks.choiceAgrees,
  usd: Number(rows.reduce((s, row) => s + (('usd' in row ? row.usd : 0) ?? 0), 0).toFixed(6)),
})}\n`);
