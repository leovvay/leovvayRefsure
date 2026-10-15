import type { ApprovedRequest } from '../../../src/egress';
import type { SiteId, SiteRequest } from '../../../src/questions';
import type { JevAnswer } from './jev-answer';

/** refsure's Jev provider behind its egress pipeline, as the harness uses it. */
export interface JevAsker {
  host: string;
  model: string;
  /** The approved request, or the refusal's cause and detail; `piiMasks` overrides the config's mask mode. */
  approve(site: SiteId, request: SiteRequest, piiMasks?: boolean): ApprovedRequest | { cause: string; detail: string };
  ask(request: ApprovedRequest): Promise<JevAnswer>;
}
