import type { CauseRow } from './cause-row';
import type { Status } from './status';

const row = (cause: string, status: Status, summary: string): CauseRow => ({ cause, status, summary });

/**
 * Every `why.cause` refsure emits, with its one status (spec §6.1). A task that introduces a cause adds its row
 * here, so `causes --json` stays complete. An agent that meets an unknown cause acts on the exit class.
 */
export const CAUSES: readonly CauseRow[] = [
  row('none_chosen', 'abstained', 'The Decision picked none of the offered options.'),
  row('low_confidence', 'abstained', 'The answer was below the threshold for this site, risk and provider.'),
  row('twins', 'abstained', 'The pick has identical twins; narrow it with --within or --first.'),
  row('proposed_only', 'abstained', 'The ticket only proposes at this risk; it may not act.'),
  row('disagree', 'abstained', 'The two providers did not pick the same option.'),
  row('not_seen', 'abstained', 'wait-for did not see it within its timeout; never a claim that it is absent.'),
  row('stalled', 'abstained', 'Not seen, and the page text and URL stopped changing for the --stall time; report it.'),
  row('done_unconfirmed', 'abstained', 'run: the Decision said the goal is done, and nothing (--expect, --text) confirmed it.'),
  row('blocked', 'abstained', 'run: no offered operation can make progress (a sign-in, a bot check, a missing value).'),
  row('no_progress', 'abstained', 'run: acts or scrolls changed nothing three times in a row, or the same act came a third time on one page.'),
  row('budget', 'abstained', 'run: --max-steps or --timeout ran out before the goal showed.'),

  row('veto', 'refused', 'The control is on the never-click list (accept, subscribe, settings, ...).'),
  row('high_risk_class', 'refused', 'Money, irreversible, auth or consent: refused on this path.'),
  row('oversize', 'refused', 'The request was over the egress byte bounds.'),
  row('provider_not_allowed', 'refused', 'That provider or combination is not allowed at this site.'),
  row('origin_denied', 'refused', 'The page origin or profile is outside the configured origin policy.'),
  row('ambiguous_option', 'refused', 'Two options read the same once folded; refsure will not pick.'),

  row('page_changed', 'stale', 'The page moved on since the ticket: a different URL or element.'),
  row('ticket_expired', 'stale', 'The ticket or mark is past its time to live, or no such mark is kept.'),
  row('ticket_used', 'stale', 'The ticket was already claimed; tickets are single use.'),
  row('ref_gone', 'stale', 'The element is no longer on the page; take a fresh snapshot.'),
  row('expect_name_mismatch', 'stale', 'The live ref shows another name than --expect-name; nothing was done.'),

  row('provider_timeout', 'unavailable', 'The provider did not answer within its time budget.'),
  row('provider_error', 'unavailable', 'The provider failed or answered invalidly.'),
  row(
    'no_tab', 'unavailable',
    'No browser tab: none is current, the page id is unknown, or the agent-browser session is closed (next.argv '
      + 'then opens it, headless).',
  ),
  row('orca_not_running', 'unavailable', 'Orca is not running, or its CLI could not be reached.'),
  row('browser_timeout', 'unavailable', 'A browser call timed out before anything was dispatched.'),
  row('browser_error', 'unavailable', 'The browser backend failed before anything was dispatched.'),
  row(
    'off_screen', 'unavailable',
    'run: the Orca tab is hidden and takes no input; nothing was sent. Rerun on your own headless agent-browser '
      + 'session (next.argv opens it).',
  ),
  row('internal', 'unavailable', 'refsure hit an unexpected error before acting.'),

  row(
    'unsupported', 'unsupported_by_backend',
    'The browser backend lacks a capability this command needs, or cannot send this input; a retry will not help.',
  ),
  row('spend_limit', 'spend_limit', 'The per-minute Decision cap or the daily spend cap was reached.'),

  row('not_set_up', 'not_set_up', 'A key or a consent grant is missing; a human runs `refsure setup`.'),
  row('config_mode', 'not_set_up', 'The config file is readable or writable by group or others; chmod 600 it.'),
  row('literal_key', 'not_set_up', 'The config holds a literal key; name an env variable or a command.'),
  row('gateway_insecure', 'not_set_up', 'The gateway URL is neither https nor localhost.'),
  row('config_invalid', 'not_set_up', 'The config file could not be read as a refsure config.'),
  row('backend_unknown', 'not_set_up', 'REFSURE_BACKEND names no backend; a human sets it to orca or agent-browser.'),

  row(
    'not_in_orca_terminal', 'not_in_orca_terminal',
    'The Orca backend needs an Orca terminal (ORCA_WORKTREE_ID); elsewhere, use an agent-browser session.',
  ),
  row('effect_unknown', 'effect_unknown', 'An act was dispatched and its effect is unconfirmed; re-observe first.'),
  row('dry_run', 'ok', 'Dry run: the exact redacted requests are shown; nothing was sent or done.'),
  row('usage', 'usage', 'The command line was not valid; nothing was done.'),
];

const BY_CAUSE: ReadonlyMap<string, Status> = new Map(CAUSES.map((entry) => [entry.cause, entry.status]));

/** An unlisted cause is a programming error; it reads as `unavailable`, a class where nothing happened. */
export function causeStatus(cause: string): Status {
  return BY_CAUSE.get(cause) ?? 'unavailable';
}
