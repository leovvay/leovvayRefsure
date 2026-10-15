import type { CommandContext, CommandOutcome } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { nothingDone } from '../shared';
import type { MarkRecord } from './mark-record';
import { loadMark, MARK_TTL_MS } from './mark-store';

/**
 * The mark `id`, still alive and taken on `pageId`, or the outcome that says why not: `stale` (`ticket_expired`)
 * when it is past its time or not kept, `hint` saying what to do instead; `usage` when another page took it.
 */
export async function markOnPage<Result>(
  ctx: Pick<CommandContext, 'store' | 'now'>, id: string, pageId: string, hint: string,
): Promise<MarkRecord | CommandOutcome<Result>> {
  const mark = await loadMark(ctx.store, id, ctx.now());
  if (mark === 'missing' || mark === 'expired') {
    const what = mark === 'missing'
      ? `no mark ${id} is kept; marks live ${MARK_TTL_MS / 60_000} minutes`
      : `mark ${id} has expired`;
    return nothingDone<Result>('stale', 'ticket_expired', `${what}: ${hint}`, { next: RE_OBSERVE });
  }
  if (mark.pageId !== pageId) {
    return nothingDone<Result>('usage', 'usage', `mark ${id} was taken on page ${mark.pageId}, not ${pageId}: pass --page ${mark.pageId}`);
  }
  return mark;
}
