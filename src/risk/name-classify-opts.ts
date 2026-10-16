import type { ActAction } from '../browser';
import type { RiskClass } from './risk-class';

/** What `classifyNames` reads beside the names of a live ref known by nothing else. */
export interface NameClassifyOpts {
  /** The tab's URL, for the path rules. */
  url: string;
  action: ActAction;
  /** `--risk`: it can only raise the class. */
  userRisk?: RiskClass;
  /** The element's explicit `role` attribute, when it has one; else a role is taken from the action. */
  role?: string | null;
}
