import type { CommandOutcome, CommandSpec } from '../../cli';
import type { Next } from '../../output';
import type { SnapArgs, SnapScope } from './snap.args';
import type { SnapResult } from './snap.contract';
import { cutLines, linesLength, MAX_CHARS_LIMIT, snapLines, wholeBudget } from './snap-lines';

const MAX_CHARS_DEFAULT = '4000';
/**
 * The finish rule: under the default budget, a list that fits in twice that prints whole. A second snap costs the
 * agent a turn, and a turn costs far more than what it prints (measured inside Claude Code at 23,000-33,000 tokens
 * of session overhead per tool call: only-cli/oc, src/render.js). Twice the 4,000-character default is about 2,000
 * tokens, oc's own bound for printing whole. A `--max-chars` the caller gave stays a hard cap.
 */
const FINISH = 2;
const SCOPES: readonly SnapScope[] = ['dialog', 'main', 'form'];

function isScope(value: string): value is SnapScope {
  return (SCOPES as readonly string[]).includes(value);
}

/** The same snap with the budget that prints every line; the registry pins it to the page. */
function showAll(args: SnapArgs, total: number): Next {
  const scope = args.scope === null ? [] : ['--scope', args.scope];
  const all = args.interactive ? [] : ['--all'];
  return { do: 'snapshot', argv: ['refsure', 'snap', `--max-chars=${wholeBudget(total)}`, ...scope, ...all] };
}

/** Compact lines in line format v1 with ordinals and refs (spec §6.3), filtered locally. Reads only. */
export const snapCommand: CommandSpec<SnapArgs, SnapResult> = {
  name: 'snap',
  summary: 'Print compact element lines: line format v1 plus #<ordinal>/<twins> @eN',
  since: '0.1.0',
  stability: 'stable',
  options: {
    'max-chars': {
      type: 'string', default: MAX_CHARS_DEFAULT,
      summary: 'Cut the lines at a line boundary past this many characters; left out, a list up to twice the default prints whole',
    },
    scope: { type: 'string', summary: 'Only elements inside a dialog, main or form' },
    interactive: { type: 'boolean', summary: 'Only interactive elements with a ref', default: true },
    all: { type: 'boolean', summary: 'Every named node, not only interactive ones (overrides --interactive)' },
  },
  forms: ['[--max-chars 4000] [--scope dialog|main|form] [--all]'],
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
    const maxCharsGiven = raw.tokens.some((token) => token.name === 'max-chars');
    return { maxChars, maxCharsGiven, scope: scope ?? null, interactive: raw.values.all !== true };
  },
  async run(args, ctx) {
    if (ctx.page === null) throw new Error('snap needs a page, and none was resolved');
    const tree = await ctx.browser.snapshot(ctx.page);
    const all = snapLines(tree, args);
    const finish = !args.maxCharsGiven && linesLength(all) <= args.maxChars * FINISH;
    const { lines, dropped, total } = cutLines(all, finish ? Infinity : args.maxChars);
    const result: SnapResult = { lines, dropped };
    if (tree.dropped > 0) result.unparsed = tree.dropped;
    ctx.trace.untrusted.add('result.lines');
    const outcome: CommandOutcome<SnapResult> = { status: 'ok', acted: false, effect: 'none', result };
    if (dropped > 0) outcome.next = showAll(args, total);
    return outcome;
  },
};
