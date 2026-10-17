import type { CommandContext, CommandOutcome } from '../../cli';
import { causeStatus, type Next, RE_OBSERVE } from '../../output';
import { nothingDone } from '../shared';
import { formatDuration } from './duration';
import type { PollTally } from './poll-tally';
import type { WaitForArgs } from './wait-for.args';
import type { WaitForResult } from './wait-for.contract';

/** A page that stopped changing is reported, not waited on: only the human says to wait longer. */
const STALLED_NEXT: Next = { do: 'stop' };

type ResultOf = (verdict: WaitForResult['verdict'], by: WaitForResult['by']) => WaitForResult;

/**
 * Why a stall ended early: the Decision was unsure (inside its band), or, after a clear no, the caller found that
 * the page asks for more input (`asks` names what it shows).
 */
export type StallNote = { unsure: { confidence: number; threshold: number } } | { asks: string };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** `--max-decisions` is below one round and only the Decision could settle the wait: nothing was asked. */
export function belowOneRound(cap: number, calls: number): CommandOutcome<WaitForResult> {
  return nothingDone<WaitForResult>('usage', 'usage', `--max-decisions ${cap} is below one Decision round of ${calls} `
    + `provider calls, and without --text or --url nothing else can see it: allow at least ${calls}, or add --text or --url`);
}

/**
 * The stall rule (spec §6.2, `--stall`): neither the page text nor the URL changed for `stallMs`, so what the wait
 * expects is not coming by itself. `stalled` (exit 10), never "absent" and never "failed". `next` is `stop`: only
 * the human says to wait longer. When a poll's text was withheld (`typedWithheld`), no Decision read it, so the
 * detail says so and `next` is to look again: the page may show it already. With `lean`, the Decision was unsure
 * (inside its band) and the page has not changed for `stallMs` since: the detail says so.
 */
export function stalled(
  stallMs: number, tally: PollTally, result: ResultOf, note: StallNote | null = null,
): CommandOutcome<WaitForResult> {
  const notes = [plural(tally.polls, 'poll'), plural(tally.decisions, 'provider call')];
  if (tally.withheld > 0) {
    notes.push(`the page text was withheld on ${tally.withheld} of them (typed_text_withheld), so no Decision read it `
      + 'there; --text "<literal>" lets code see it');
  }
  return {
    status: 'abstained',
    acted: false,
    effect: 'none',
    result: result('stalled', tally.answered > 0 ? 'decision' : 'code'),
    why: {
      cause: 'stalled',
      detail: stallDetail(stallMs, notes.join('; '), note),
    },
    next: tally.withheld > 0 || (note !== null && 'asks' in note) ? RE_OBSERVE : STALLED_NEXT,
  };
}

function stallDetail(stallMs: number, notes: string, note: StallNote | null): string {
  const still = `the page text and URL have not changed for ${formatDuration(stallMs)}`;
  if (note === null) {
    return `not seen, and ${still} (${notes}); the wait for it is over: report the page as it stands, and wait again `
      + 'only for a time the human named';
  }
  if ('asks' in note) {
    return `not seen: the page now shows ${note.asks}, and ${still} since the Decision said no (${notes}); it asks for `
      + 'more input: do only the steps still to do';
  }
  return `not confirmed: the Decision was unsure (${note.unsure.confidence}, under the ${note.unsure.threshold} edge), `
    + `and ${still} since (${notes}); judge the new text yourself`;
}

/**
 * The wait is over: it ran out, was interrupted, or (`early`) the Decision closed on a wait no code rule can settle.
 * `not_seen` (exit 10) when code looked all along or a provider answered; when the wait rested on the Decision and
 * no provider ever answered, it could not run: `unavailable` with the last provider cause.
 */
export function ended(
  args: WaitForArgs,
  ctx: CommandContext,
  end: { tally: PollTally; byCode: boolean; closed: string | null; early: boolean; lastCause: string | null; result: ResultOf },
): CommandOutcome<WaitForResult> {
  const { tally, lastCause } = end;
  const capped = tally.decisions >= args.maxDecisions ? `the --max-decisions cap of ${args.maxDecisions} was reached` : null;
  const closed = end.closed ?? capped;
  const notes = [plural(tally.polls, 'poll'), plural(tally.decisions, 'provider call')];
  if (closed !== null && !end.early) notes.push(closed);
  if (lastCause !== null && !(closed ?? '').includes(lastCause)) notes.push(`the last Decision: ${lastCause}`);
  // Only the Decision could see it, and it never got a page: the end is no judgement (spec §7.3).
  if (!end.byCode && tally.decisions === 0 && tally.withheld === tally.polls) {
    const all = tally.polls === 1 ? 'the one poll' : `all ${tally.polls} polls`;
    notes.push(`the page text was withheld on ${all}, so nothing judged it`);
  }
  let within = `within ${formatDuration(args.timeoutMs)}`;
  if (end.early && closed !== null) within = `before ${closed}`;
  else if (ctx.signal.aborted) within = 'before the wait was interrupted';
  if (!end.byCode && tally.answered === 0 && lastCause !== null && causeStatus(lastCause) === 'unavailable') {
    return {
      status: 'unavailable',
      acted: false,
      effect: 'none',
      result: end.result(null, 'decision'),
      why: { cause: lastCause, detail: `no provider answered ${within} (${notes.join('; ')})` },
      next: RE_OBSERVE,
    };
  }
  return {
    status: 'abstained',
    acted: false,
    effect: 'none',
    result: end.result('not_seen', tally.answered > 0 ? 'decision' : 'code'),
    why: { cause: 'not_seen', detail: `not seen ${within} (${notes.join('; ')})` },
    next: RE_OBSERVE,
  };
}
