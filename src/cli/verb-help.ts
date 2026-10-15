import { newTrace } from '../output';
import type { AnyCommandSpec } from './any-command-spec';
import { finish } from './build-envelope';
import type { CommandResult } from './command-result';
import { helpOutcome } from './registry-outcomes';
import { commandHelp } from './usage';

/** `--help` or `-h` among the verb's own options (not inside the act after `--`). */
export function wantsHelp(argv: readonly string[]): boolean {
  const end = argv.indexOf('--');
  const own = end === -1 ? argv : argv.slice(0, end);
  return own.includes('--help') || own.includes('-h');
}

/**
 * `refsure <verb> --help` as a result, or `null` when no help was asked. It needs no config, keys or browser, so
 * the composition root answers it before loading any of them: help works on a broken config too.
 */
export function verbHelp(spec: AnyCommandSpec, argv: readonly string[]): CommandResult | null {
  return wantsHelp(argv) ? finish(spec.name, helpOutcome(commandHelp(spec)), null, newTrace()) : null;
}
