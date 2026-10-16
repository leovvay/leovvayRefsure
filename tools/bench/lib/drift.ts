import { createHash } from 'node:crypto';
import { readJsonl } from '../../calibrate/lib/jsonl';
import { prepare } from './ask';
import type { ArmRuntime } from './ask';
import type { BenchItem } from './items';

/*
  2.5 drift since the prior run. The set is built through refsure's presence site with masks off, and each approved
  request's wire body (`provider.body` at the arm's rendering, the exact bytes the row would send) is compared byte
  for byte with the prior run's stored body for the same item, read from a `--prior` file kept outside the repo (one
  JSON object per line):
    {"id": "<item id>", "body": "<the prior wire body, exact text>",
     "answers": {"r1": {"order", "status", "p_true", "answer", "model"}, "r2": {...}, "r3": {...}}}
  Items whose bodies are byte-identical are re-asked (variant `drift`, repeats r1..r3), each row carrying the prior
  stored answer of the same repeat as `prior`; the rest are listed (first differing byte, both sizes and sha256s)
  and never asked: a differing body, an item the prior file does not hold, or an egress refusal.
*/

export const DRIFT_VARIANT = 'drift';

/** One prior stored answer: `p_true` is the prior's p(true), `answer` its own key (`true`/`false`), null when none. */
export interface PriorAnswer { order: string; status: string; p_true: number | null; answer: string | null; model: string | null }
export interface PriorLine { id: string; body: string; answers: Record<string, PriorAnswer> }

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Reads and checks a `--prior` file; throws on a malformed or repeated line. */
export function readPrior(path: string): Map<string, PriorLine> {
  const out = new Map<string, PriorLine>();
  for (const line of readJsonl<PriorLine>(path)) {
    if (typeof line.id !== 'string' || typeof line.body !== 'string' || typeof line.answers !== 'object' || line.answers === null) {
      throw new Error(`${path}: a line lacks id, body (the prior wire text) or answers`);
    }
    for (const [repeat, a] of Object.entries(line.answers)) {
      if (typeof a?.status !== 'string' || (a.p_true !== null && typeof a.p_true !== 'number')) {
        throw new Error(`${path}: ${line.id} ${repeat}: an answer needs status and p_true (number or null)`);
      }
    }
    if (out.has(line.id)) throw new Error(`${path}: item ${line.id} appears twice`);
    out.set(line.id, line);
  }
  if (out.size === 0) throw new Error(`${path}: no prior line`);
  return out;
}

/** The first byte at which two byte strings differ (the shorter length when one is a prefix), or null when equal. */
export function firstDiff(a: Buffer, b: Buffer): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? null : n;
}

/** One item's body check; `byte`/`prior_byte` are the two bytes at `first_diff` (hex), never any text around them. */
export interface BodyCheck {
  item: string;
  result: 'same' | 'differs' | 'no_prior' | 'refused';
  first_diff: number | null;
  byte: string | null;
  prior_byte: string | null;
  bytes: number | null;
  prior_bytes: number | null;
  sha256: string | null;
  prior_sha256: string | null;
  refused?: string;
}

const hexAt = (b: Buffer, at: number | null): string | null => (at === null || at >= b.length ? null : b[at]!.toString(16).padStart(2, '0'));

/** The drift plan: items whose masks-off body equals the prior's (asked), and every item's check (listed). */
export interface DriftPlan { same: Set<string>; checks: BodyCheck[]; prior: Map<string, PriorLine> }

/** Builds every item masks off (no network) and compares its wire body with the prior's, byte for byte. */
export function driftPlan(rt: ArmRuntime, items: readonly BenchItem[], prior: Map<string, PriorLine>): DriftPlan {
  const same = new Set<string>();
  const checks: BodyCheck[] = [];
  for (const item of items) {
    const p = prepare(rt, item, 'fixed', undefined, { masks: false });
    const line = prior.get(item.id);
    const theirs = line === undefined ? null : Buffer.from(line.body, 'utf8');
    const ours = p.body === null ? null : Buffer.from(JSON.stringify(p.body), 'utf8');
    const at = ours !== null && theirs !== null ? firstDiff(ours, theirs) : null;
    const result: BodyCheck['result'] = ours === null ? 'refused' : theirs === null ? 'no_prior' : at === null ? 'same' : 'differs';
    if (result === 'same') same.add(item.id);
    checks.push({
      item: item.id, result, first_diff: at,
      byte: ours === null ? null : hexAt(ours, at), prior_byte: theirs === null ? null : hexAt(theirs, at),
      bytes: ours?.length ?? null, prior_bytes: theirs?.length ?? null,
      sha256: ours === null ? null : sha256(ours), prior_sha256: theirs === null ? null : sha256(theirs),
      ...(p.refusal ? { refused: p.refusal.cause } : {}),
    });
  }
  return { same, checks, prior };
}

/** Counts per check result, for the run's summary line and the listing file. */
export function driftCounts(checks: readonly BodyCheck[]): Record<BodyCheck['result'], number> {
  const out = { same: 0, differs: 0, no_prior: 0, refused: 0 };
  for (const check of checks) out[check.result] += 1;
  return out;
}

/** The row's `prior` field (analyze/verdict.ts driftRows reads `prior.p_true`): the prior answer of the same repeat. */
export function priorOf(line: PriorLine | undefined, repeat: string, fileSha: string): Record<string, unknown> {
  const a = line?.answers[repeat];
  if (line === undefined || a === undefined) return { found: false, repeat, p_true: null, answer: null, file_sha256: fileSha };
  return {
    found: true, repeat, order: a.order, status: a.status, p_true: a.p_true, answer: a.answer, model: a.model,
    body_sha256: sha256(Buffer.from(line.body, 'utf8')), file_sha256: fileSha,
  };
}
