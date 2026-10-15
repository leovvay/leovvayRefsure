import { applyUntrusted, type EgressEntry, type Envelope, exitFor, type PageInfo, type RunTrace } from '../output';
import { VERSION } from '../version';
import type { CommandOutcome } from './command-outcome';
import type { CommandResult } from './command-result';

// The trace's notes (e.g. a refused state-file mode) ride along in `result.notes`.
function resultObject(result: unknown, notes: readonly string[]): Record<string, unknown> | null {
  let out: Record<string, unknown> | null = null;
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) out = result as Record<string, unknown>;
  else if (result !== null && result !== undefined) out = { value: result };
  if (notes.length === 0) return out;
  const base = out ?? {};
  const prior = Array.isArray(base.notes) ? base.notes : base.notes === undefined ? [] : [base.notes];
  return { ...base, notes: [...prior, ...notes] };
}

// One row per host, in first-call order: a wait's tenth call to one host says no more than its total does.
function egressByHost(entries: RunTrace['egress']): EgressEntry[] | null {
  if (entries.length === 0) return null;
  const bytes = new Map<string, number>();
  for (const entry of entries) bytes.set(entry.host, (bytes.get(entry.host) ?? 0) + entry.bytes);
  return [...bytes].map(([host, total]) => ({ host, bytes: total }));
}

export function buildEnvelope(
  command: string,
  outcome: CommandOutcome<unknown>,
  page: PageInfo | null,
  trace: RunTrace,
): Envelope {
  const envelope: Envelope = {
    refsure: 1,
    version: VERSION,
    command,
    status: outcome.status,
    acted: outcome.acted,
    effect: outcome.effect,
    page,
    result: resultObject(outcome.result, trace.notes),
    why: outcome.why ?? null,
    decision: outcome.settledByCode ? null : trace.decisions.at(-1) ?? null,
    egress: egressByHost(trace.egress),
    refs: { snapshot: trace.snapshotTaken, earlier_refs_void: trace.snapshotTaken },
    untrusted: [],
    next: outcome.next ?? null,
  };
  // The page's URL is page text too: its path, query and fragment are whatever the page put there.
  return applyUntrusted(envelope, page === null ? trace.untrusted : [...trace.untrusted, 'page.url']);
}

/** The exit comes only from the status (spec §6.1); a command never sets one. */
export function finish(
  command: string,
  outcome: CommandOutcome<unknown>,
  page: PageInfo | null,
  trace: RunTrace,
): CommandResult {
  const envelope = buildEnvelope(command, outcome, page, trace);
  const result: CommandResult = { envelope, exit: exitFor(envelope.status) };
  if (envelope.status === 'ok' && outcome.text !== undefined) result.text = outcome.text;
  return result;
}
