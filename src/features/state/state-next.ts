import type { Next } from '../../output';

/** After a rate-limit page, look again in this long; the page's own retry hint is page text and is not read. */
const RATE_LIMIT_WAIT_MS = 30_000;

/** The spec §6.2 table: what an agent does after each research state. `expected` needs nothing. */
export function stateNext(verdict: string, expect: string): Next | null {
  switch (verdict) {
    case 'blocking_modal':
      return { do: 'dismiss', argv: ['refsure', 'dismiss'] };
    case 'rate_limited':
      return { do: 'wait', after_ms: RATE_LIMIT_WAIT_MS, argv: ['refsure', 'state', '--expect', expect] };
    case 'login_wall':
    case 'bot_challenge':
      return { do: 'needs_human' };
    case 'error_page':
    case 'unexpected_page':
      return { do: 'stop' };
    default:
      return null;
  }
}
