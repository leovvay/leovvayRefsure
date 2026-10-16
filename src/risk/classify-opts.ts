import type { ActAction } from '../browser';
import type { RiskClass } from './risk-class';

/** What `classify` reads beside the tree and the node. */
export interface ClassifyOpts {
  /** The tab's URL, for the path rules. */
  url: string;
  action?: ActAction;
  /** `--risk`: it can only raise the class. */
  userRisk?: RiskClass;
}
