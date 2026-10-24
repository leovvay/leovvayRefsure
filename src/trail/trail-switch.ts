const OFF: ReadonlySet<string> = new Set(['off', '0', 'false']);

/**
 * `REFSURE_TRAIL=off` (or `0`, `false`, any case) turns the trail off; anything else, or nothing, leaves it on. An
 * environment switch only, never a config key: the config loads lazily, and a verb that reads none of it still runs
 * on a broken config file, so the trail must not read it either.
 */
export function trailSwitchedOff(env: NodeJS.ProcessEnv): boolean {
  return OFF.has(env.REFSURE_TRAIL?.trim().toLowerCase() ?? '');
}
