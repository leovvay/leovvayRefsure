import type { Maturity, ProviderChoice, SiteId } from '../questions';
import type { Next, Status, Why } from './status';

export interface PageInfo { backend: 'orca' | 'agent-browser'; id: string; url: string; profile: string | null }

export interface DecisionPart {
  provider: 'jev' | 'openai';
  model: string;
  index: string | null;
  confidence: number | null;
  threshold: number | null;
  ms: number;
  usd: number | null;
}

export interface DecisionInfo {
  site: SiteId;
  wording: { version: number; hash: string };
  provider: ProviderChoice;
  model: string;
  maturity: Maturity;
  confidence: number | null;
  threshold: number | null;
  ms: number;
  usd: number | null;
  parts: DecisionPart[];
  model_changed?: true;
}

export interface EgressEntry { host: string; bytes: number }

/** The one JSON object every command prints on stdout (spec §6.1). Fields are only ever added. */
export interface Envelope {
  refsure: 1;
  version: string;
  command: string;
  status: Status;
  acted: boolean;
  effect: 'none' | 'dispatched' | 'unknown';
  page: PageInfo | null;
  result: Record<string, unknown> | null;
  why: Why | null;
  decision: DecisionInfo | null;
  egress: EgressEntry[] | null;
  refs: { snapshot: boolean; earlier_refs_void: boolean };
  untrusted: string[];
  next: Next | null;
}
