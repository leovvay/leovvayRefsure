import type { CommandContext, CommandOutcome, CommandSpec } from '../../cli';
import type { Next } from '../../output';
import { isMarkId } from '../../tickets';
import { loadMark } from '../mark';
import { nothingDone } from '../shared';
import type { TriageArgs } from './triage.args';
import type { TriageResult } from './triage.contract';
import { capLines, consoleLines, networkLines, sinceFilter, TRIAGE_MAX } from './triage-lines';

const MARK_AGAIN: Next = { do: 'snapshot', argv: ['refsure', 'mark'] };

/** Drops the line times the cut needed: the envelope shows what happened, not when. */
function bare<T extends { at: number | null }>(lines: readonly T[]): Omit<T, 'at'>[] {
  return lines.map(({ at: _at, ...line }) => line);
}

async function sinceMs(args: TriageArgs, ctx: CommandContext, pageId: string): Promise<number | null | CommandOutcome<TriageResult>> {
  if (args.since === null) return null;
  const mark = await loadMark(ctx.store, args.since, ctx.now());
  if (mark === 'missing') return nothingDone('stale', 'ticket_expired', `no mark ${args.since} is kept; marks live 15 minutes`, { next: MARK_AGAIN });
  if (mark === 'expired') return nothingDone('stale', 'ticket_expired', `mark ${args.since} has expired; take a new one`, { next: MARK_AGAIN });
  if (mark.pageId !== pageId) {
    return nothingDone('usage', 'usage', `mark ${args.since} was taken on page ${mark.pageId}, not ${pageId}: pass --page ${mark.pageId}`);
  }
  return mark.createdAt;
}

/**
 * What went wrong on the page, by code (spec §6.3): console errors and warnings, requests that failed (status
 * ≥400, or 0), and the tab's load error. URLs lose their query and are redacted; console text is redacted and
 * masked. With `--since M`, only lines from after the mark; console lines carry no time, so all are kept, and
 * `untimed` says so. Orca lists only what it saw after it first drove the tab. Reads only; sends nothing.
 */
export const triageCommand: CommandSpec<TriageArgs, TriageResult> = {
  name: 'triage',
  summary: 'List console errors, failed requests (status ≥400 or 0) and the load error, optionally since a mark',
  since: '0.1.0',
  stability: 'stable',
  options: {
    since: { type: 'string', summary: 'Only lines after this mark (from `refsure mark`); console lines carry no time' },
  },
  needs: { page: 'required', capabilities: ['console', 'network'], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `triage takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.rest.length > 0) return { usage: 'triage takes nothing after --' };
    if (raw.values.since === undefined) return { since: null };
    const since = typeof raw.values.since === 'string' ? raw.values.since.trim() : '';
    if (!isMarkId(since)) return { usage: '--since takes the id `refsure mark` printed (m_…)' };
    return { since };
  },
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('triage needs a page, and none was resolved');
    const since = await sinceMs(args, ctx, page.id);
    if (typeof since === 'object' && since !== null) return since;
    const [tab, logged, requests] = await Promise.all([
      ctx.browser.tabInfo(page), ctx.browser.console!(page), ctx.browser.network!(page),
    ]);
    const cons = sinceFilter(consoleLines(logged), since);
    const net = sinceFilter(networkLines(requests), since);
    const capped = capLines(cons, net);
    const result: TriageResult = {
      console: bare(capped.console),
      network: bare(capped.network),
      load_error: tab.loadError,
      certificate_failure: tab.certificateFailure,
      since: args.since,
      dropped: capped.dropped,
    };
    if (since !== null) {
      const untimed: ('console' | 'network')[] = [];
      if (capped.console.some((line) => line.at === null)) untimed.push('console');
      if (capped.network.some((line) => line.at === null)) untimed.push('network');
      if (untimed.length > 0) result.untimed = untimed;
    }
    if (capped.dropped > 0) ctx.trace.notes.push(`over ${TRIAGE_MAX} lines: the ${capped.dropped} earliest are left out`);
    ctx.trace.untrusted.add('result.console');
    ctx.trace.untrusted.add('result.network');
    ctx.trace.untrusted.add('result.load_error');
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
