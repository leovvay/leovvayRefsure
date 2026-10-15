import { createBrowser } from './browser';
import type { BrowserPort } from './browser';
import { routeArgv, runCommand, verbHelp } from './cli';
import type { AnyCommandSpec, CommandResult, RegistryDeps } from './cli';
import { configOnce, keySet, resolvePaths } from './config';
import type { RefsureConfig } from './config';
import { FEATURES } from './features';
import { createFileStore } from './local-state';
import { newTrace, redactPatterns, renderEnvelope } from './output';
import type { RunTrace } from './output';
import { makeProviders } from './providers';
import { createDecide } from './questions';
import type { DecideFn, RouteCheckFn } from './questions';
import { createTicketBook } from './tickets';

// The composition root, and the only place that sets the process exit (spec §6.1). One invocation, one trace:
// browser → store and tickets → the registry over FEATURES. The config, and the keys, providers and decide()
// built on it, load on first use: a verb that reads none of them runs on a broken config file, and one that does
// gets the file's ConfigError, which the registry maps to not_set_up (exit 23) with its cause.

const CRASH_DETAIL_MAX = 500;
/** 128 + the signal number: what a shell reports for a process a second signal stopped. */
const FORCED_EXIT: Readonly<Record<'SIGINT' | 'SIGTERM', number>> = { SIGINT: 130, SIGTERM: 143 };

/**
 * The first SIGINT or SIGTERM aborts the run's signal: a provider call or a setup prompt stops, and the command
 * still prints its envelope (an act already dispatched reads as effect_unknown). A second one exits at once.
 */
function abortOnSignals(controller: AbortController): void {
  const onSignal = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`interrupted by ${signal}`));
      return;
    }
    process.exit(FORCED_EXIT[signal]);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

function emit(result: CommandResult): number {
  // A verb whose product is a file (`skill print`) prints it byte for byte: no envelope, no added newline.
  process.stdout.write(result.text ?? `${renderEnvelope(result.envelope)}\n`);
  return result.exit;
}

/** decide() and routeCheck(), composed from config, keys and providers on the first Decision asked. */
function lazyDecide(parts: {
  config: () => RefsureConfig;
  env: NodeJS.ProcessEnv;
  trace: RunTrace;
  command: string;
  profile: () => string | null;
}): { decide: DecideFn; routeCheck: RouteCheckFn } {
  let built: { decide: DecideFn; routeCheck: RouteCheckFn } | null = null;
  const compose = (): { decide: DecideFn; routeCheck: RouteCheckFn } => {
    if (built) return built;
    const config = parts.config();
    const keys = keySet(config, parts.env);
    built = createDecide({
      config, keys, providers: makeProviders(config, keys), trace: parts.trace, command: parts.command,
      pageProfile: parts.profile,
    });
    return built;
  };
  return {
    decide: async (site, input, opts) => compose().decide(site, input, opts),
    routeCheck: async (site, opts) => compose().routeCheck(site, opts),
  };
}

async function runVerb(
  spec: AnyCommandSpec,
  argv: string[],
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<CommandResult> {
  // Help needs no config, keys or browser, so a broken config cannot hide it.
  const help = verbHelp(spec, argv);
  if (help) return help;
  const trace = newTrace();
  signal.addEventListener('abort', () => trace.notes.push('interrupted'), { once: true });
  const config = configOnce(env);
  // Orca in an Orca terminal, else an agent-browser session (see chooseBackend).
  const paths = resolvePaths(env);
  const backend = createBrowser({ env, trace, stateDir: paths.state });
  // The profile of the last tab read, for the isolated-profile rule; null (refused when required) until one is read.
  let profileId: string | null = null;
  const browser: BrowserPort = {
    ...backend,
    async tabInfo(page) {
      const tab = await backend.tabInfo(page);
      profileId = tab.profileId;
      return tab;
    },
  };
  // Local state lives where the paths say, whatever the config file holds. Expired entries are purged by runCommand.
  const store = createFileStore(paths.state, trace);
  const tickets = createTicketBook(store);
  const { decide, routeCheck } = lazyDecide({ config, env, trace, command: spec.name, profile: () => profileId });
  const deps: RegistryDeps = {
    browser, decide, routeCheck, tickets, store, trace, env, signal,
    get config() {
      return config();
    },
    now: () => Date.now(),
  };
  return runCommand(spec, argv, deps);
}

async function main(argv: string[]): Promise<number> {
  const route = routeArgv(argv, FEATURES);
  if (route.kind === 'print') {
    process.stdout.write(`${route.text}\n`);
    return route.exit;
  }
  if (route.kind === 'unknown') return emit(route.result);
  const controller = new AbortController();
  abortOnSignals(controller);
  return emit(await runVerb(route.spec, route.argv, process.env, controller.signal));
}

// Exit 1 is reserved for a crash outside the registry's own failure mapping: the agent re-observes.
main(process.argv.slice(2)).then(
  (exit) => {
    process.exitCode = exit;
  },
  (error: unknown) => {
    const message = redactPatterns(error instanceof Error ? error.message : String(error));
    process.stderr.write(`refsure: crashed: ${message.slice(0, CRASH_DETAIL_MAX)}\n`);
    process.exitCode = 1;
  },
);
