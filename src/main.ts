import { createOrcaBrowser } from './browser';
import type { BrowserPort } from './browser';
import { failureResult, routeArgv, runCommand } from './cli';
import type { AnyCommandSpec, CommandResult, RegistryDeps } from './cli';
import { keySet, loadConfig } from './config';
import type { RefsureConfig } from './config';
import { FEATURES } from './features';
import { createFileStore } from './local-state';
import { newTrace, redactPatterns, renderEnvelope } from './output';
import { makeProviders } from './providers';
import { createDecideStub } from './questions';
import { createTicketBook } from './tickets';

// The composition root, and the only place that sets the process exit (spec §6.1). One invocation, one trace:
// config → keys → providers → browser → store and tickets → decide → the registry over FEATURES.

const CRASH_DETAIL_MAX = 500;

function emit(result: CommandResult): number {
  process.stdout.write(`${renderEnvelope(result.envelope)}\n`);
  return result.exit;
}

async function runVerb(spec: AnyCommandSpec, argv: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const trace = newTrace();
  let config: RefsureConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    // A ConfigError carries its cause (config_mode, literal_key, ...) and maps to not_set_up (exit 23).
    return failureResult(spec.name, error, trace);
  }
  const keys = keySet(config, env);
  const providers = makeProviders(config, keys);
  const orca = createOrcaBrowser({ env, trace });
  // The profile of the last tab read, for the isolated-profile rule; null (refused when required) until one is read.
  let profileId: string | null = null;
  const browser: BrowserPort = {
    ...orca,
    async tabInfo(page) {
      const tab = await orca.tabInfo(page);
      profileId = tab.profileId;
      return tab;
    },
  };
  const store = createFileStore(config.paths.state, trace);
  const tickets = createTicketBook(store);
  // Task 10 swaps this for createDecide with the same deps. Expired local state is purged by runCommand.
  const { decide, routeCheck } = createDecideStub({
    config, keys, providers, trace, command: spec.name, pageProfile: () => profileId,
  });
  const deps: RegistryDeps = {
    browser, decide, routeCheck, tickets, store, config, trace, env,
    now: () => Date.now(),
    signal: new AbortController().signal,
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
  return emit(await runVerb(route.spec, route.argv, process.env));
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
