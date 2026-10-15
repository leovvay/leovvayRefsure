import type { DecisionQuestion } from './wire-types';

export interface SiteRequest { state: Record<string, string>; questions: Record<string, DecisionQuestion> }
