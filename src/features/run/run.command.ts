import type { CommandSpec } from '../../cli';
import type { RunArgs } from './run.args';
import type { RunResult } from './run.contract';
import { FILLS_MAX, parseRun, RUN_DEFAULTS } from './parse-run';
import { runRun } from './run-loop';

/**
 * A multi-step task on one site in one call (design 2026-10-17): Jev picks each step, one Decision per step, and
 * code acts. Every act is found again on a fresh snapshot by its fingerprint and guarded as `act` guards a ticket:
 * risk at least write, high risk refused to `act-high-risk`, the veto, and a write never sent twice by this code.
 */
export const runCommand: CommandSpec<RunArgs, RunResult> = {
  name: 'run',
  summary: 'Hand over a multi-step task on one site: Jev picks each step, refsure acts on it guarded, until it is done',
  since: '0.1.0',
  stability: 'experimental',
  options: {
    goal: { type: 'string', summary: 'What to get done on this site, in a sentence or two (required); sent to the provider' },
    fill: {
      type: 'string', multiple: true,
      summary: `A value run may type, "<what it is>=<value>" (at most ${FILLS_MAX}); the only text it types; `
        + 'sent to the provider',
    },
    expect: { type: 'string', summary: 'What shows once it is done; judged on text new since the start only' },
    text: { type: 'string', summary: 'A literal that ends it by code once it is in the new text' },
    'max-steps': { type: 'string', summary: `The most steps, 1 to 60 (default ${RUN_DEFAULTS.maxSteps})` },
    timeout: { type: 'string', summary: `How long it may take, from 5s to 10m (default ${RUN_DEFAULTS.timeout})` },
    'no-dismiss': { type: 'boolean', summary: 'Leave any cookie banner or pop-up alone at the start' },
  },
  forms: [
    `--goal "<what to get done on this site>" [--fill "<what it is>=<value>"]... (up to ${FILLS_MAX}) `
      + `[--expect "<what shows when it is done>"] [--text <literal>] [--max-steps ${RUN_DEFAULTS.maxSteps}] `
      + `[--timeout ${RUN_DEFAULTS.timeout}] [--no-dismiss]`,
  ],
  needs: { page: 'required', capabilities: [], sites: ['dismiss', 'step'], acts: 'recheck' },
  parse: parseRun,
  run: runRun,
};
