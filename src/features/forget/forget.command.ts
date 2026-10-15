import { namedPage, type PageRef } from '../../browser';
import { type CommandContext, type CommandOutcome, type CommandSpec, hintOf } from '../../cli';
import type { ForgetArgs } from './forget.args';
import type { ForgetResult } from './forget.contract';

/**
 * The page to clear. A page the invocation names (`--page`, `REFSURE_PAGE`) is taken as given, never probed: a
 * closed tab or session still holds marks and tickets, and they must still clear. Only with neither is the
 * current page resolved through the browser.
 */
async function pageToClear(args: Extract<ForgetArgs, { all: false }>, ctx: CommandContext): Promise<PageRef> {
  const named = namedPage(args.hint, ctx.env);
  return named === null ? ctx.browser.resolvePage(args.hint) : { backend: ctx.browser.backend, id: named };
}

/** What was cleared, or under `--dry-run` what would be, with nothing touched. */
async function cleared(
  ctx: CommandContext, scope: ForgetResult['scope'], pageId: string | null,
): Promise<CommandOutcome<ForgetResult>> {
  const which = pageId === null ? 'all' as const : { pageId };
  if (ctx.dryRun) {
    ctx.trace.notes.push('dry_run: nothing was cleared');
    const would = await ctx.store.count(which);
    return { status: 'ok', acted: false, effect: 'none', result: { removed: 0, scope, would_remove: would } };
  }
  const removed = pageId === null ? await ctx.store.clearAll() : await ctx.store.clearPage(pageId);
  return { status: 'ok', acted: false, effect: 'none', result: { removed, scope } };
}

/**
 * Clears local state (spec §6.3, §8.7): this page's marks and tickets, or every page's with `--all`. The page is
 * found here, not by the registry, so `--all` needs no tab, and a closed tab's id still clears. Reads nothing
 * from the page and sends nothing; `--dry-run` only counts.
 */
export const forgetCommand: CommandSpec<ForgetArgs, ForgetResult> = {
  name: 'forget',
  summary: 'Clear this page\'s marks and tickets, or every page\'s with --all',
  since: '0.1.0',
  stability: 'stable',
  options: {
    all: { type: 'boolean', summary: 'Clear every page\'s marks and tickets' },
  },
  forms: ['[--all]'],
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `forget takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.rest.length > 0) return { usage: 'forget takes nothing after --' };
    const hint = hintOf(raw);
    if (raw.values.all === true) {
      if (hint.page !== undefined) return { usage: '--all clears every page: drop --page' };
      return { all: true };
    }
    return { all: false, hint };
  },
  async run(args, ctx) {
    // Marks and tickets both live in the state store, filed by page: one clear takes both kinds.
    if (args.all) return cleared(ctx, 'all', null);
    const page = await pageToClear(args, ctx);
    ctx.page = page;
    return cleared(ctx, 'page', page.id);
  },
};
