import type { BrowserCapability, BrowserPort, PageHint, PageRef, TabInfo } from '../browser';
import { expiresAtOf } from '../local-state';
import { DryRunStop, newTrace, type PageInfo, type RunTrace, type Status, WIRE_COPY_PATH } from '../output';
import { finish } from './build-envelope';
import type { CommandContext } from './command-context';
import type { CommandOutcome } from './command-outcome';
import type { CommandResult } from './command-result';
import type { CommandSpec } from './command-spec';
import { isUsageError, parseCommandArgs } from './parse-args';
import type { ParsedArgs } from './parsed-args';
import { watchBrowser } from './registry-browser';
import type { RegistryDeps } from './registry-deps';
import { RegistryInvariantError } from './registry-invariant-error';
import {
  actedRule, dryRunOutcome, failureOutcome, helpOutcome, pinNextToPage, unsupportedOutcome, usageOutcome,
} from './registry-outcomes';
import { commandHelp } from './usage';
import { wantsHelp } from './verb-help';
import type { WatchedBrowser } from './watched-browser';

interface Settled { outcome: CommandOutcome<unknown>; watched: WatchedBrowser | null; page: PageRef | null }

// After these the browser is known to be out of reach, so the envelope does not ask it for the page URL.
const BROWSER_DOWN: ReadonlySet<Status> = new Set<Status>(['unavailable', 'not_in_orca_terminal', 'usage']);

function hintOf(raw: ParsedArgs): PageHint {
  return typeof raw.values.page === 'string' ? { page: raw.values.page } : {};
}

// A verb that needs no capability never asks: a port with no backend chosen answers that question with an error.
function missingCapabilities(needs: readonly BrowserCapability[], browser: BrowserPort): BrowserCapability[] {
  if (needs.length === 0) return [];
  const has = browser.features();
  return needs.filter((capability) => !has.has(capability));
}

// Spec §8.7: every call purges expired entries. A purge failure never blocks the command.
async function purgeExpired(deps: RegistryDeps): Promise<void> {
  try {
    await deps.store.purge(deps.now(), expiresAtOf);
  } catch {
    deps.trace.notes.push('state_purge_failed');
  }
}

function profileOf(tab: TabInfo): string | null {
  return tab.profileId ?? tab.profileLabel;
}

async function settle<Args, Result>(
  spec: CommandSpec<Args, Result>,
  argv: readonly string[],
  deps: RegistryDeps,
): Promise<Settled> {
  const idle = { watched: null, page: null };
  if (wantsHelp(argv)) return { ...idle, outcome: helpOutcome(commandHelp(spec)) };
  const raw = parseCommandArgs(spec, argv);
  if (isUsageError(raw)) return { ...idle, outcome: usageOutcome(spec.name, raw.usage) };
  const dryRun = raw.values['dry-run'] === true;
  const watched = watchBrowser(deps.browser, { command: spec.name, mayAct: spec.needs.acts !== 'never', dryRun });
  let page: PageRef | null = null;
  // A command that finds its own page (a ticket names it) sets `ctx.page`; a thrown failure still names it.
  let ctx: CommandContext | null = null;
  try {
    const args = spec.parse(raw);
    if (isUsageError(args)) return { ...idle, outcome: usageOutcome(spec.name, args.usage) };
    const missing = missingCapabilities(spec.needs.capabilities, deps.browser);
    if (missing.length > 0) return { ...idle, outcome: unsupportedOutcome(deps.browser.backend, missing) };
    await purgeExpired(deps);
    if (spec.needs.page === 'required') page = await watched.port.resolvePage(hintOf(raw));
    ctx = {
      browser: watched.port,
      page,
      decide: deps.decide,
      routeCheck: deps.routeCheck,
      tickets: deps.tickets,
      store: deps.store,
      // Read through, never copied: the config loads when a command first reads it (see CommandContext).
      get config() {
        return deps.config;
      },
      trace: deps.trace,
      signal: deps.signal,
      now: () => deps.now(),
      dryRun,
      env: deps.env,
    };
    const outcome = await spec.run(args, ctx);
    return { watched, page: ctx.page, outcome };
  } catch (error) {
    page = ctx?.page ?? page;
    if (error instanceof DryRunStop && !deps.trace.dispatched) {
      // The requests hold page text, redacted and masked, but still the page's words: listed, shown uncut.
      deps.trace.untrusted.add(WIRE_COPY_PATH);
      return { watched, page, outcome: dryRunOutcome(deps.trace) };
    }
    return { watched, page, outcome: failureOutcome(error, deps.trace.dispatched) };
  }
}

// The envelope names the resolved page, or the last tab the command read; with no read, one best-effort read.
async function pageInfoOf(settled: Settled, status: Status): Promise<PageInfo | null> {
  const { watched, page } = settled;
  if (!watched) return null;
  let tab = watched.lastTab();
  if (page && tab?.id !== page.id && !BROWSER_DOWN.has(status)) {
    try {
      tab = await watched.port.tabInfo(page);
    } catch {
      // The envelope still names the page, without its URL.
    }
  }
  if (page) {
    const seen = tab?.id === page.id ? tab : null;
    return { backend: page.backend, id: page.id, url: seen?.url ?? '', profile: seen ? profileOf(seen) : null };
  }
  return tab ? { backend: watched.port.backend, id: tab.id, url: tab.url, profile: profileOf(tab) } : null;
}

/**
 * Runs one verb under the registry rules (spec §5.2, §6.1): parse, capabilities, page, run, then the acted rule.
 * It never throws for a page, provider or input condition; it throws only when a command breaks `acts: never`,
 * which the caller reports as a crash (exit 1, re-observe).
 */
export async function runCommand<Args, Result>(
  spec: CommandSpec<Args, Result>,
  argv: readonly string[],
  deps: RegistryDeps,
): Promise<CommandResult> {
  const settled = await settle(spec, argv, deps);
  if (spec.needs.acts === 'never' && (settled.outcome.acted || deps.trace.dispatched)) {
    throw new RegistryInvariantError(`${spec.name} declares acts: never, yet it reported an act`);
  }
  const outcome = pinNextToPage(actedRule(settled.outcome, deps.trace.dispatched), settled.page);
  const page = await pageInfoOf(settled, outcome.status);
  return finish(spec.name, outcome, page, deps.trace);
}

/** For failures before the registry can run a verb, e.g. a `ConfigError` while composing (→ `not_set_up`). */
export function failureResult(command: string, error: unknown, trace: RunTrace = newTrace()): CommandResult {
  return finish(command, failureOutcome(error, trace.dispatched), null, trace);
}
