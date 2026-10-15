import type { DecideDeps } from './decide-deps';
import type { DecideFn, RouteCheckFn } from './decide-fn';

const DETAIL = 'decisions arrive in a later build';

/**
 * Placeholder for `createDecide`: every Decision abstains as `not_set_up`, and every route check refuses with the
 * same cause, so a command that needs a Decision stops before it reads or sends anything. It takes the deps the
 * real factory will take, so swapping it in is one line in `main.ts`.
 */
export function createDecideStub(deps: DecideDeps): { decide: DecideFn; routeCheck: RouteCheckFn } {
  void deps;
  const decide: DecideFn = async (site) => ({
    verdict: { kind: 'abstain', cause: 'not_set_up', detail: DETAIL, leaned: null, confidence: null, threshold: null },
    maturity: site.policy.maturity,
    modelChanged: false,
    newFamily: false,
  });
  const routeCheck: RouteCheckFn = async () => ({ ok: false, cause: 'not_set_up', detail: DETAIL });
  return { decide, routeCheck };
}
