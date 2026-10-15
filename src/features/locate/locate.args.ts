import type { RiskClass } from '../../risk';

/** `locate (--intent i | --recorded line) [--risk r] [--within row] [--first] [--top N]`. */
export interface LocateArgs {
  /** What the element is for; the `find` site's intent, or the `locate` site's step intent with `--recorded`. */
  intent: string | null;
  /** A v1 line the agent recorded earlier, verbatim: asks the `locate` site. */
  recorded: string | null;
  /** `--risk`: raises the class and picks the threshold row; the strictest row without it. */
  risk?: RiskClass;
  /** Keep only the candidates whose row text contains this (`fold`ed). */
  within: string | null;
  /** Take ordinal 1 of a twin group; refused at money and irreversible. */
  first: boolean;
  /** List up to N presented candidates by the model's ranking. */
  top: number | null;
}
