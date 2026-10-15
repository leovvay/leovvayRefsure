import type { CommandSpec } from '../../cli';
import { DEFAULTS, parseWaitFor } from './parse-wait-for';
import { pollPresence } from './poll-presence';
import type { WaitForArgs } from './wait-for.args';
import type { WaitForResult } from './wait-for.contract';

/**
 * Waits until the page shows what `--expect` describes (spec §6.2). Code first on every poll (`--text`, `--url`);
 * else the presence Noul, asked only when the text changed, at most once per interval and within
 * `--max-decisions` provider calls. With both providers set up, `agree` is the default route. Reads only.
 */
export const waitForCommand: CommandSpec<WaitForArgs, WaitForResult> = {
  name: 'wait-for',
  summary: 'Wait until the page shows what you describe: present, or not_seen at the timeout (never "absent")',
  since: '0.1.0',
  stability: 'stable',
  options: {
    expect: { type: 'string', summary: 'What should appear, described in a few words (required)' },
    text: { type: 'string', summary: 'A literal that settles it by code once it is on the page' },
    url: { type: 'string', summary: 'A URL glob (* = any run) that settles it by code once the tab matches it' },
    timeout: { type: 'string', summary: 'How long to wait, as 10s, 90s or 2m; from 1s to 10m', default: DEFAULTS.timeout },
    interval: { type: 'string', summary: 'Time between polls, as 1s or 1500ms; from 1s to 5m', default: DEFAULTS.interval },
    'max-decisions': {
      type: 'string', summary: 'Provider calls the wait may make; 0 waits by code only', default: DEFAULTS.maxDecisions,
    },
    agree: { type: 'boolean', summary: 'Both providers must say present (needs both set up)' },
  },
  forms: [
    '--expect "<what should appear>" [--text <literal>] [--url <glob>] [--timeout 30s] [--interval 2s] '
      + '[--max-decisions 10] [--agree]',
  ],
  needs: { page: 'required', capabilities: [], sites: ['presence'], acts: 'never' },
  parse: parseWaitFor,
  async run(args, ctx) {
    if (ctx.page === null) throw new Error('wait-for needs a page, and none was resolved');
    return pollPresence(args, ctx, ctx.page);
  },
};
