import { newTrace } from '../output';
import { VERSION } from '../version';
import type { AnyCommandSpec } from './any-command-spec';
import type { ArgvRoute } from './argv-route';
import { finish } from './build-envelope';
import { commandHelp, usageText } from './usage';

const HELP: ReadonlySet<string> = new Set(['--help', '-h', 'help']);
const VERB_SHOWN_MAX = 80;

/**
 * The top-level dispatch for `main.ts`. `refsure`, `refsure --help` and `refsure help [verb]` print help text
 * (exit 0); an unknown verb is a `usage` envelope with `command: "?"` (exit 64).
 */
export function routeArgv(argv: readonly string[], features: readonly AnyCommandSpec[]): ArgvRoute {
  const [verb, ...rest] = argv;
  if (verb === undefined || HELP.has(verb)) {
    const named = verb === 'help' ? features.find((spec) => spec.name === rest[0]) : undefined;
    return { kind: 'print', text: named ? commandHelp(named) : usageText(features), exit: 0 };
  }
  if (verb === '--version') return { kind: 'print', text: `refsure ${VERSION}`, exit: 0 };
  const spec = features.find((candidate) => candidate.name === verb);
  if (spec) return { kind: 'command', spec, argv: rest };
  const shown = verb.length > VERB_SHOWN_MAX ? `${verb.slice(0, VERB_SHOWN_MAX)}…` : verb;
  const result = finish('?', {
    status: 'usage',
    acted: false,
    effect: 'none',
    result: { usage: usageText(features) },
    why: { cause: 'usage', detail: `unknown command ${JSON.stringify(shown)}` },
  }, null, newTrace());
  return { kind: 'unknown', result };
}
