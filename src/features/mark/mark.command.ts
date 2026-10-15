import type { CommandSpec } from '../../cli';
import { norm } from '../../page-model';
import { newMarkId } from '../../tickets';
import { readPage } from '../shared';
import type { MarkArgs } from './mark.args';
import type { MarkResult } from './mark.contract';
import { MARK_TTL_MS, markView, saveMark } from './mark-store';

const LABEL_MAX = 80;

/**
 * Remembers the page as it is now (spec §6.2, §8.7), before the agent acts on its own over several steps; then
 * `outcome --mark` asks whether the intent landed since. Stores the query-less URL and the redacted, masked
 * title and text for 15 minutes. Reads only: nothing is sent and nothing is clicked.
 */
export const markCommand: CommandSpec<MarkArgs, MarkResult> = {
  name: 'mark',
  summary: 'Remember the page as it is now, for a later outcome --mark or triage --since',
  since: '0.1.0',
  stability: 'stable',
  options: {
    label: { type: 'string', summary: `A label to show with the mark, up to ${LABEL_MAX} characters (display only)` },
  },
  forms: ['[--label L]'],
  needs: { page: 'required', capabilities: [], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `mark takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.values.label === undefined) return { label: null };
    const label = typeof raw.values.label === 'string' ? norm(raw.values.label) : '';
    if (label === '') return { usage: '--label is empty: give it a few words, or leave it out' };
    if (label.length > LABEL_MAX) return { usage: `--label is ${label.length} characters; keep it to ${LABEL_MAX}` };
    return { label };
  },
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('mark needs a page, and none was resolved');
    const view = markView(await readPage(ctx.browser, page));
    const id = newMarkId();
    await saveMark(ctx.store, { id, pageId: page.id, label: args.label, ...view, createdAt: ctx.now(), ttlMs: MARK_TTL_MS });
    return {
      status: 'ok',
      acted: false,
      effect: 'none',
      result: { mark: id, label: args.label, expires_in_s: MARK_TTL_MS / 1000 },
    };
  },
};
