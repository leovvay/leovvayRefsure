import { NEEDS_HUMAN, type Next } from '../../output';

/** After a rate-limit page, look again in this long; the page's own retry hint is page text and is not read. */
const RATE_LIMIT_WAIT_MS = 30_000;

/**
 * The spec §6.2 table: what an agent does after each research state, in the research set or in a custom set that
 * names it (spec §6.3); `expected` and every other key need nothing. `again` is the same `state` call, for the wait.
 */
export function stateNext(verdict: string, again: readonly string[]): Next | null {
  switch (verdict) {
    case 'blocking_modal':
      return { do: 'dismiss', argv: ['refsure', 'dismiss'] };
    case 'rate_limited':
      return { do: 'wait', after_ms: RATE_LIMIT_WAIT_MS, argv: [...again] };
    case 'login_wall':
    case 'bot_challenge':
      return NEEDS_HUMAN;
    case 'error_page':
    case 'unexpected_page':
      return { do: 'stop' };
    default:
      return null;
  }
}
