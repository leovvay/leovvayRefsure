import type { Fingerprint } from '../../page-model';
import type { RiskClass } from '../../risk';

/** `refsure guard`: the risk class of clicking the element, every rule that raised it, and what it is on the page. */
export interface GuardResult {
  class: RiskClass;
  /** e.g. `base:write`, `lexicon:en:irreversible:delete`, `dialog:confirm`, `url:checkout`, `raiser:password`. */
  reasons: string[];
  /** Page text: role, `norm`ed name, path, ordinal and twin count. */
  fingerprint: Fingerprint;
}
