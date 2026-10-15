import { type BrowserErrorCode, isBrowserError, type PageRef } from '../browser';
import { isConfigError } from '../config';
import { type Next, redactPatterns, type RunTrace, type Status } from '../output';
import type { CommandOutcome } from './command-outcome';

const BROWSER_FAILURES: Readonly<Record<BrowserErrorCode, { status: Status; cause: string }>> = {
  not_in_orca_terminal: { status: 'not_in_orca_terminal', cause: 'not_in_orca_terminal' },
  orca_not_running: { status: 'unavailable', cause: 'orca_not_running' },
  no_tab: { status: 'unavailable', cause: 'no_tab' },
  stale_ref: { status: 'stale', cause: 'ref_gone' },
  timeout: { status: 'unavailable', cause: 'browser_timeout' },
  backend_error: { status: 'unavailable', cause: 'browser_error' },
  unsupported: { status: 'unsupported_by_backend', cause: 'unsupported' },
  backend_unknown: { status: 'not_set_up', cause: 'backend_unknown' },
};

const DETAIL_MAX = 500;
const RE_OBSERVE: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };

function clean(text: string): string {
  const redacted = redactPatterns(text);
  return redacted.length > DETAIL_MAX ? `${redacted.slice(0, DETAIL_MAX - 1)}…` : redacted;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nothingDone(status: Status, cause: string, detail: string, next?: Next): CommandOutcome<never> {
  const outcome: CommandOutcome<never> = { status, acted: false, effect: 'none', result: null, why: { cause, detail } };
  if (next) outcome.next = next;
  return outcome;
}

/**
 * A thrown error as an outcome. After a dispatch only `effect_unknown` is honest, whatever was thrown. Before it,
 * a `BrowserError` maps by code, a config error to `not_set_up`, and anything else to `unavailable`/`internal`.
 */
export function failureOutcome(error: unknown, dispatched: boolean): CommandOutcome<never> {
  if (dispatched) {
    return {
      status: 'effect_unknown',
      acted: true,
      effect: 'unknown',
      result: null,
      why: { cause: 'effect_unknown', detail: clean(messageOf(error)) },
      next: RE_OBSERVE,
    };
  }
  if (isBrowserError(error)) {
    const { status, cause } = BROWSER_FAILURES[error.code] ?? BROWSER_FAILURES.backend_error;
    return nothingDone(status, cause, clean(error.detail), cause === 'ref_gone' ? RE_OBSERVE : undefined);
  }
  // `detail` alone: the message repeats the cause, which `why.cause` already carries.
  if (isConfigError(error)) return nothingDone('not_set_up', error.cause_, clean(error.detail));
  return nothingDone('unavailable', 'internal', clean(messageOf(error)));
}

export function usageOutcome(command: string, message: string): CommandOutcome<never> {
  return nothingDone('usage', 'usage', clean(`${message} (see: refsure ${command} --help)`));
}

export function unsupportedOutcome(backend: string, missing: readonly string[]): CommandOutcome<never> {
  return nothingDone('unsupported_by_backend', 'unsupported', `the ${backend} backend lacks: ${missing.join(', ')}`);
}

export function dryRunOutcome(trace: RunTrace): CommandOutcome<Record<string, unknown>> {
  return {
    status: 'ok',
    acted: false,
    effect: 'none',
    result: { dry_run: true, requests: trace.dryRun },
    why: { cause: 'dry_run', detail: 'nothing was sent and nothing was done' },
  };
}

export function helpOutcome(text: string): CommandOutcome<Record<string, unknown>> {
  return { status: 'ok', acted: false, effect: 'none', result: { usage: text } };
}

/**
 * Spec §6.1: an outcome that acted exits only 0 or 30. Anything else after an act becomes `effect_unknown`,
 * keeping `why`. A dispatch the trace saw counts as acting even when the command forgot to say so.
 */
export function actedRule<R>(outcome: CommandOutcome<R>, dispatched: boolean): CommandOutcome<R> {
  if (!outcome.acted && !dispatched) return outcome;
  const effect = outcome.effect === 'none' ? 'dispatched' : outcome.effect;
  if (outcome.status === 'ok' || outcome.status === 'effect_unknown') return { ...outcome, acted: true, effect };
  return { ...outcome, acted: true, status: 'effect_unknown', effect: 'dispatched' };
}

/**
 * A `refsure` next step runs on the page this command ran on: its argv gains `--page <id>` unless it names one.
 * Without it, an agent that targeted another tab by `--page` or `REFSURE_PAGE` would follow it onto the current tab.
 */
export function pinNextToPage<R>(outcome: CommandOutcome<R>, page: PageRef | null): CommandOutcome<R> {
  const next = outcome.next;
  const argv = next?.argv;
  if (!page || !next || !argv || argv[0] !== 'refsure') return outcome;
  const end = argv.indexOf('--');
  const own = end === -1 ? argv : argv.slice(0, end);
  if (own.includes('--page')) return outcome;
  const rest = end === -1 ? [] : argv.slice(end);
  return { ...outcome, next: { ...next, argv: [...own, '--page', page.id, ...rest] } };
}
