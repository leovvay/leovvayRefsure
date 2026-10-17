import type { CommandSpec } from '../../cli';
import type { DoArgs } from './do.args';
import type { DoResult } from './do.contract';
import { DO_DEFAULTS, parseDo, STEPS_MAX } from './parse-do';
import { runDo } from './run-do';

/**
 * A whole task in one call (fast-path spec §2.1): one dismiss level, every step located on one snapshot, the acts in
 * command-line order through `act`'s ticket path, then a wait that judges only the text new since the start. Safety
 * is `act`'s: each act is claimed, rechecked and guarded, high risk is refused, and a write is never sent twice.
 */
export const doCommand: CommandSpec<DoArgs, DoResult> = {
  name: 'do',
  summary: 'Run a whole task in one call: dismiss, fill, select, check, click in order, then wait for what should show',
  since: '0.1.0',
  stability: 'experimental',
  options: {
    fill: { type: 'string', multiple: true, summary: 'A step: fill a text field, "<field>=<value>" (split at the first =)' },
    select: { type: 'string', multiple: true, summary: 'A step: choose a native select option by its label, "<field>=<option>"' },
    check: { type: 'string', multiple: true, summary: 'A step: check a box, "<box>"' },
    uncheck: { type: 'string', multiple: true, summary: 'A step: uncheck a box, "<box>"' },
    click: { type: 'string', multiple: true, summary: 'A step: click a control, "<control>"' },
    expect: { type: 'string', summary: 'What should show after the steps; judged on text new since the start only' },
    text: { type: 'string', summary: 'A literal that settles it by code once it is in the new text (needs --expect)' },
    timeout: { type: 'string', summary: `How long to wait for --expect, from 1s to 10m (default ${DO_DEFAULTS.timeout})` },
    stall: {
      type: 'string', summary: `End the wait (stalled) once the page text and URL stop changing this long (default ${DO_DEFAULTS.stall})`,
    },
    'no-dismiss': { type: 'boolean', summary: 'Leave any cookie banner or pop-up alone' },
  },
  forms: [
    `[--fill "<field>=<value>"] [--select "<field>=<option>"] [--check "<box>"] [--uncheck "<box>"] [--click "<control>"] `
      + `... (up to ${STEPS_MAX} steps, run in the order given) [--expect "<what should show after>"] [--text <literal>] `
      + `[--timeout ${DO_DEFAULTS.timeout}] [--stall ${DO_DEFAULTS.stall}] [--no-dismiss]`,
  ],
  needs: { page: 'required', capabilities: [], sites: ['dismiss', 'locate', 'find', 'presence'], acts: 'ticket' },
  parse: parseDo,
  run: runDo,
};
