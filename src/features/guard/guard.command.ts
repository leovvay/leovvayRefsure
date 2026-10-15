import { isRef } from '../../browser';
import type { CommandSpec } from '../../cli';
import { fingerprintOf } from '../../page-model';
import { classify, maxRisk, pageRaisers } from '../../risk';
import type { GuardArgs } from './guard.args';
import type { GuardResult } from './guard.contract';

/**
 * The risk class of clicking `@eN` (spec §6.3, §8.5): a snapshot, then the lexicon, confirm-dialog and URL rules,
 * then the page raisers for a click. Code only: no Decision, nothing sent, nothing clicked.
 */
export const guardCommand: CommandSpec<GuardArgs, GuardResult> = {
  name: 'guard',
  summary: 'Classify the risk of clicking an element: read, write, consent, auth, money or irreversible',
  since: '0.1.0',
  stability: 'stable',
  options: {
    ref: { type: 'string', summary: 'The element, as @eN from the latest snapshot' },
  },
  needs: { page: 'required', capabilities: [], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `guard takes no positional arguments, got ${raw.positionals.length}` };
    const given = raw.values.ref;
    if (typeof given !== 'string' || given.trim() === '') return { usage: 'guard needs --ref @eN' };
    const ref = given.trim().replace(/^@/, '');
    if (!isRef(ref)) return { usage: `--ref must look like @e12, got ${JSON.stringify(given.slice(0, 40))}` };
    return { ref };
  },
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('guard needs a page, and none was resolved');
    const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
    const i = tree.nodes.findIndex((node) => node.ref === args.ref);
    if (i === -1) {
      return {
        status: 'stale',
        acted: false,
        effect: 'none',
        result: null,
        why: { cause: 'ref_gone', detail: `@${args.ref} is not in the current snapshot` },
        next: { do: 'snapshot', argv: ['refsure', 'snap'] },
      };
    }
    const reading = classify(tree, i, { url: tab.url, action: 'click' });
    const raised = await pageRaisers(ctx.browser, page, 'click');
    ctx.trace.untrusted.add('result.fingerprint');
    const result: GuardResult = {
      class: maxRisk(reading.class, raised.class),
      reasons: [...reading.reasons, ...raised.reasons],
      fingerprint: fingerprintOf(tree, i),
    };
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
