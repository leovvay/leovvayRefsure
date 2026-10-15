import type { CommandSpec } from '../../cli';
import type { SnapArgs, SnapScope } from './snap.args';
import type { SnapResult } from './snap.contract';
import { cutLines, snapLines } from './snap-lines';

const MAX_CHARS_DEFAULT = '4000';
const MAX_CHARS_LIMIT = 1_000_000;
const SCOPES: readonly SnapScope[] = ['dialog', 'main', 'form'];

function isScope(value: string): value is SnapScope {
  return (SCOPES as readonly string[]).includes(value);
}

/** Compact lines in line format v1 with ordinals and refs (spec §6.3), filtered locally. Reads only. */
export const snapCommand: CommandSpec<SnapArgs, SnapResult> = {
  name: 'snap',
  summary: 'Print compact element lines: line format v1 plus #<ordinal>/<twins> @eN',
  since: '0.1.0',
  stability: 'stable',
  options: {
    'max-chars': { type: 'string', summary: 'Cut the lines at a line boundary past this many characters', default: MAX_CHARS_DEFAULT },
    scope: { type: 'string', summary: 'Only elements inside a dialog, main or form' },
    interactive: { type: 'boolean', summary: 'Only interactive elements with a ref', default: true },
    all: { type: 'boolean', summary: 'Every named node, not only interactive ones (overrides --interactive)' },
  },
  needs: { page: 'required', capabilities: [], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `snap takes no positional arguments, got ${raw.positionals.length}` };
    const text = typeof raw.values['max-chars'] === 'string' ? raw.values['max-chars'] : MAX_CHARS_DEFAULT;
    const maxChars = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > MAX_CHARS_LIMIT) {
      return { usage: `--max-chars must be a whole number from 1 to ${MAX_CHARS_LIMIT}` };
    }
    const scope = raw.values.scope;
    if (scope !== undefined && (typeof scope !== 'string' || !isScope(scope))) {
      return { usage: `--scope must be one of ${SCOPES.join(', ')}` };
    }
    return { maxChars, scope: scope ?? null, interactive: raw.values.all !== true };
  },
  async run(args, ctx) {
    if (ctx.page === null) throw new Error('snap needs a page, and none was resolved');
    const tree = await ctx.browser.snapshot(ctx.page);
    const { lines, dropped } = cutLines(snapLines(tree, args), args.maxChars);
    const result: SnapResult = { lines, dropped };
    if (tree.dropped > 0) result.unparsed = tree.dropped;
    ctx.trace.untrusted.add('result.lines');
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
