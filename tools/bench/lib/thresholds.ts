import type { RiskClass } from '../../../src/risk';
import { SITES, thresholdFor } from '../../../src/questions';
import type { NoulBand, ProviderId, SiteId, Threshold } from '../../../src/questions';
import { CHOICE_START, LOCATE_ROWS, NOUL_BAND } from '../../../src/questions/sites/starting-thresholds';

/*
  The 2.2 threshold per row. `refsure`: exactly the call decide.ts makes, `thresholdFor(site, provider, risk, <the
  arm's configured model>, <the input's wording hash>)`, so calibration.json entries apply. `research`: where that
  returns null (OpenAI on locate, find, outcome, option-map), Jev's starting rows by risk, NOUL_BAND or
  CHOICE_START. An item without a risk label reads the strictest row, as refsure does without `--risk`.
*/

export type ThresholdSource = 'refsure' | 'research';

export interface RowThreshold { threshold: Threshold; source: ThresholdSource }

const RISKS: readonly RiskClass[] = ['read', 'write', 'consent', 'auth', 'money', 'irreversible'];

/** The item's risk label as a refsure risk class; anything else (null, `none`) is no risk. */
export function riskOf(label: string | null | undefined): RiskClass | undefined {
  return RISKS.includes(label as RiskClass) ? (label as RiskClass) : undefined;
}

function research(site: SiteId, risk: RiskClass | undefined): Threshold {
  if (site === 'locate' || site === 'find') return risk === undefined ? Math.max(...Object.values(LOCATE_ROWS)) : LOCATE_ROWS[risk];
  if (site === 'outcome') return NOUL_BAND;
  if (site === 'option-map') return CHOICE_START;
  throw new Error(`refsure gives every provider a row at ${site}; no research row exists`);
}

/** 2.2: the R1 threshold and where it came from. `wordingHash` is the shipped hash (ablation rows keep it). */
export function rowThreshold(site: SiteId, provider: ProviderId, riskLabel: string | null, model: string, wordingHash: string): RowThreshold {
  const risk = riskOf(riskLabel);
  const shipped = thresholdFor(SITES[site], provider, risk, model, wordingHash);
  return shipped === null ? { threshold: research(site, risk), source: 'research' } : { threshold: shipped, source: 'refsure' };
}

/** `shipped` when refsure offers this provider at this site today, else `research` (2.2). */
export function routeOf(site: SiteId, provider: ProviderId): 'shipped' | 'research' {
  return SITES[site].policy.threshold[provider] === undefined ? 'research' : 'shipped';
}

function isBand(threshold: Threshold): threshold is NoulBand {
  return typeof threshold === 'object';
}

/**
 * The P0 asserts of 2.2 for the Jev arm's model: locate 0.89 at every risk, find read 0.61, outcome {.93, .15}.
 * Returns one line per failure; an empty list passes.
 */
export function p0ThresholdAsserts(jevModel: string): string[] {
  const failures: string[] = [];
  const at = (site: SiteId, risk: string | null) => rowThreshold(site, 'jev', risk, jevModel, SITES[site].wording.hash).threshold;
  for (const risk of [...RISKS, null]) {
    const value = at('locate', risk);
    if (value !== 0.89) failures.push(`locate ${risk ?? 'no risk'}: ${JSON.stringify(value)}, expected 0.89`);
  }
  const findRead = at('find', 'read');
  if (findRead !== 0.61) failures.push(`find read: ${JSON.stringify(findRead)}, expected 0.61`);
  const outcome = at('outcome', 'write');
  if (!isBand(outcome) || outcome.yesAtLeast !== 0.93 || outcome.noAtMost !== 0.15) {
    failures.push(`outcome: ${JSON.stringify(outcome)}, expected {0.93, 0.15}`);
  }
  return failures;
}
