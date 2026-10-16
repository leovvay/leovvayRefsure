import { PRESENCE_QUESTION } from '../../../src/questions/sites/wordings';
import { readNoul } from '../../../src/questions/sites/read-answer';
import type { DecisionAnswer, DecisionQuestion, ProviderId, SiteRequest, Threshold, Verdict } from '../../../src/questions';
import type { Ablation } from './ask';
import type { BenchItem } from './items';
import { BENCH_SEED, foldOf, seeded, shuffleInPlace } from './stats';

/*
  2.5 wording ablation, presence only. Each variant edits `request.questions.present` after `site.build` and before
  `approve()`; the row keeps refsure's shipped wording hash, so ablation rows never feed `fit.ts` and never enter
  Q1-Q5. Backticks are literal characters of the sent text. Criteria are the shipped ones unless the variant says.
*/

export const ABLATION_VARIANTS = ['W0', 'W1', 'W2', 'W3', 'C1', 'K'] as const;
export type AblationVariant = (typeof ABLATION_VARIANTS)[number];

const W2_TEXT = 'A browser automation checks the page described in `page`. Does it show what `expectation` describes?';

/** The exact instruction texts of 2.5. */
export const ABLATION_TEXTS: Readonly<Record<'W0' | 'W1' | 'W2' | 'W3', string>> = {
  W0: 'A browser automation checks the page described in `page` for what `expectation` describes. The page shows it.',
  W1: 'A browser automation checks the page described in `page` for what `expectation` describes.',
  W2: W2_TEXT,
  W3: `${W2_TEXT} \`expectation\` may name a kind of content, message or state (for example "a greeting" or "an error message") rather than its exact words.`,
};

/** 2.5 cells: {W0..W3, K} on three arms, C1 on the two OpenAI arms only (Jev requires criteria): 17 cells. */
export const ABLATION_CELLS: readonly { variant: AblationVariant; arm: string }[] = [
  ...(['W0', 'W1', 'W2', 'W3', 'K'] as const).flatMap((variant) => ['oa_s2', 'oa_primary', 'jev_gw'].map((arm) => ({ variant, arm }))),
  { variant: 'C1', arm: 'oa_s2' },
  { variant: 'C1', arm: 'oa_primary' },
];

export const ABLATION_REPEATS = ['r1', 'r2', 'r3'] as const;

/** The doctor-ping item verbatim (2.5), gold true. */
export const DOCTOR_PING_ITEM: BenchItem = {
  id: 'doctor-ping', base: 'doctor-ping', lang: 'en', source: 'refsure doctor --ping', condition: 'doctor_ping',
  gold: 'true', alt: [], risk: null, site: 'presence', group: 'doctor-ping',
  input: { expectation: 'a greeting', pageUrl: 'https://ping.refsure.invalid/', page: 'Welcome back, Ada' },
};

/** P0: one line per failure; empty passes. W0 must be the shipped instruction, and the shipped question a Noul with criteria. */
export function ablationAsserts(): string[] {
  const failures: string[] = [];
  if (PRESENCE_QUESTION.instructions !== ABLATION_TEXTS.W0) failures.push('W0 is not the shipped presence instruction');
  if (!PRESENCE_QUESTION.criteria) failures.push('the shipped presence question has no criteria (K and W1-W3 keep them)');
  return failures;
}

/** The question a variant sends in place of the shipped `present`. */
export function variantQuestion(variant: AblationVariant): DecisionQuestion {
  const criteria = PRESENCE_QUESTION.criteria;
  if (!criteria) throw new Error('the shipped presence question has no criteria');
  switch (variant) {
    case 'W0': case 'W1': case 'W2': case 'W3':
      return { type: 'noul', instructions: ABLATION_TEXTS[variant], criteria: { ...criteria } };
    case 'C1':
      return { type: 'noul', instructions: ABLATION_TEXTS.W0 };
    case 'K':
      return { type: 'choice', instructions: ABLATION_TEXTS.W0, criteria: { true: criteria.true, false: criteria.false } };
  }
}

/**
 * The 2.5 score of a `K` answer: `probabilities.true` when present, else `confidence` when the choice is `true`,
 * else `1 - confidence`. Null for an answer that is not a choice.
 */
export function kScore(answer: DecisionAnswer): number | null {
  if (answer.type !== 'choice') return null;
  const p = answer.probabilities?.true;
  if (typeof p === 'number') return p;
  return answer.choice === 'true' ? answer.confidence : 1 - answer.confidence;
}

/** `K` read: its score as a Noul, through refsure's own `readNoul` at the row's band (NOUL_BAND .85/.15). */
function readK(answer: DecisionAnswer, threshold: Threshold): Verdict<unknown> {
  const score = kScore(answer);
  if (score === null) return readNoul(answer, threshold, 'present');
  return readNoul({ type: 'noul', noul: score }, threshold, 'present');
}

/**
 * The `Ablation` ask.ts applies for `variant` on `provider`. Refuses C1 on Jev (Jev requires criteria) and any
 * item that is not a presence item. The edit replaces only `questions.present`; state is untouched.
 */
export function ablationFor(variant: string, provider: ProviderId): Ablation {
  if (!(ABLATION_VARIANTS as readonly string[]).includes(variant)) throw new Error(`variant ${variant}: one of ${ABLATION_VARIANTS.join(', ')}`);
  const v = variant as AblationVariant;
  if (v === 'C1' && provider === 'jev') throw new Error('variant C1 sends no criteria, which Jev requires: OpenAI arms only (2.5)');
  const question = variantQuestion(v);
  return {
    variant: v,
    edit(request: SiteRequest, item: BenchItem): SiteRequest {
      if (item.site !== 'presence' || !request.questions.present) throw new Error(`${item.id}: the 2.5 ablation applies to presence items only`);
      return { ...request, questions: { ...request.questions, present: structuredClone(question) } };
    },
    ...(v === 'K' ? { read: readK } : {}),
  };
}

/** 2.5 selection halves: `dev` when sha256(`<seed>:` + group) first byte mod 10 < 5, else `held`. */
export function ablationHalf(group: string): 'dev' | 'held' {
  return foldOf(group, 10) < 5 ? 'dev' : 'held';
}

/**
 * The 2.5 P1 sample: `n` items drawn with the bench seed, stratified by gold (proportional allocation, largest
 * remainder, strata in sorted gold order), each stratum shuffled with its own seeded stream.
 */
export function goldStratifiedSample(items: readonly BenchItem[], n = 60, seed = BENCH_SEED): BenchItem[] {
  const strata = new Map<string, BenchItem[]>();
  for (const item of items) strata.set(item.gold, [...(strata.get(item.gold) ?? []), item]);
  const golds = [...strata.keys()].sort();
  const want = Math.min(n, items.length);
  const exact = golds.map((gold) => (strata.get(gold)!.length * want) / items.length);
  const take = exact.map(Math.floor);
  const order = golds.map((_, at) => at).sort((a, b) => (exact[b]! - take[b]!) - (exact[a]! - take[a]!) || a - b);
  for (let left = want - take.reduce((s, x) => s + x, 0), k = 0; left > 0; left -= 1, k += 1) take[order[k % order.length]!]! += 1;
  return golds.flatMap((gold, at) => shuffleInPlace([...strata.get(gold)!], seeded(`${seed}:p1-sample:${gold}`)).slice(0, take[at]));
}
