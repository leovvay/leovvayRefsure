import type { CommandSpec } from '../../cli';
import type { ForgetArgs } from './forget.args';
import type { ForgetResult } from './forget.contract';

/**
 * Clears local state (spec §6.3, §8.7): this page's marks and tickets, or every page's with `--all`. The page is
 * resolved here, not by the registry, so `--all` needs no tab, and a closed tab's id still clears. Reads nothing
 * from the page and sends nothing.
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
    const page = typeof raw.values.page === 'string' ? raw.values.page.trim() : null;
    if (raw.values.all === true) {
      if (page !== null) return { usage: '--all clears every page: drop --page' };
      return { all: true };
    }
    return { all: false, hint: page === null ? {} : { page } };
  },
  async run(args, ctx) {
    // Marks and tickets both live in the state store, filed by page: one clear takes both kinds.
    if (args.all) {
      const removed = await ctx.store.clearAll();
      return { status: 'ok', acted: false, effect: 'none', result: { removed, scope: 'all' } };
    }
    const page = await ctx.browser.resolvePage(args.hint);
    ctx.page = page;
    const removed = await ctx.store.clearPage(page.id);
    return { status: 'ok', acted: false, effect: 'none', result: { removed, scope: 'page' } };
  },
};
