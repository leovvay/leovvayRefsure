import type { RiskClass } from './risk-class';

/** `reasons` like `lexicon:en:irreversible:delete`, `raiser:password`, `url:checkout`, `user:--risk`. */
export interface RiskReading { class: RiskClass; reasons: string[] }
