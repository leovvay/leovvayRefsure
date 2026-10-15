import type { ProviderId } from '../questions';

/** Where one provider's Decisions go, and which configured key pays for them. */
export interface Endpoint {
  provider: ProviderId;
  url: string;
  /** `host[:port]` of `url`: what consent grants and the egress log name. */
  host: string;
  model: string;
  key: 'openrouter' | 'openai' | 'gateway';
  /** Extra headers a gateway config names; never `authorization` or `content-type`. */
  headers: Readonly<Record<string, string>>;
}
