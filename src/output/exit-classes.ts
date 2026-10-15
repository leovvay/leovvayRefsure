import type { Status } from './status';

/**
 * One exit per status (spec §6.1). The classes: 0 ok, 10-19 decided not to act, 20-29 could not run,
 * 30-39 effect unknown, 64 usage. A status never moves between classes within a major.
 */
export const EXIT_CODES: Readonly<Record<Status, number>> = {
  ok: 0,
  abstained: 10,
  refused: 11,
  stale: 12,
  unavailable: 20,
  unsupported_by_backend: 21,
  spend_limit: 22,
  not_set_up: 23,
  not_in_orca_terminal: 24,
  effect_unknown: 30,
  usage: 64,
};

export function exitFor(status: Status): number {
  return EXIT_CODES[status];
}
