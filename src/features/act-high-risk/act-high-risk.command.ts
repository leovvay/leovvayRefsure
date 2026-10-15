import { ACT_ACTIONS } from '../../browser';
import type { CommandSpec } from '../../cli';
import type { ActHighRiskArgs } from './act-high-risk.args';
import type { ActHighRiskResult } from './act-high-risk.contract';
import { parseActHighRisk } from './parse-act-high-risk';
import { runActHighRisk } from './run-act-high-risk';

/**
 * The only path for money, irreversible, auth and consent (spec §6.3). `--class` must equal the class a fresh read
 * gives; a ticket must have been picked at ≥0.85 (or by code) with no twins; auth and consent go only by a live ref.
 * It highlights the element, then acts once. No Decision confirms anything: it never calls one. An agent host can
 * ask a human before every call (`Bash(refsure act-high-risk:*)`); the gate is advisory, not a boundary.
 */
export const actHighRiskCommand: CommandSpec<ActHighRiskArgs, ActHighRiskResult> = {
  name: 'act-high-risk',
  summary: 'Act on a money, irreversible, auth or consent control: class check, highlight, one act; no Decision confirms',
  since: '0.1.0',
  stability: 'experimental',
  forms: [
    '--class money|irreversible --ticket T --action <a> [--value v] [--risk r] --intent "<what the human asked for>"',
    '--class money|irreversible|auth|consent --ref @eN --expect-name "<name you saw>" --action <a> [--value v] '
      + '[--risk r] --intent "<what the human asked for>"',
  ],
  options: {
    class: { type: 'string', summary: 'money, irreversible, auth or consent: must equal the class a fresh read gives (required)' },
    ticket: { type: 'string', summary: 'A ticket picked at ≥0.85 or by code, with no twins (money and irreversible only)' },
    ref: { type: 'string', summary: 'Your own ref, @eN from your latest snapshot (needs --expect-name)' },
    'expect-name': { type: 'string', summary: 'The name you saw on the element; the live ref must still show it, as whole words' },
    action: { type: 'string', summary: `${ACT_ACTIONS.join(', ')} (required)` },
    value: { type: 'string', summary: 'The text to fill or the option to select (fill and select only); never logged' },
    intent: { type: 'string', summary: 'What the human asked for, in a few words (required)' },
    risk: { type: 'string', summary: 'Raise the class a fresh read gives, as the step that refused did: read … irreversible' },
  },
  needs: { page: 'none', capabilities: ['highlight'], sites: [], acts: 'high-risk' },
  parse: parseActHighRisk,
  run: runActHighRisk,
};
