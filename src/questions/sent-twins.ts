import type { ApprovedRequest } from '../egress';
import { quoteOption } from './present-candidates';
import type { Verdict } from './verdict';

/** Each option key of a Choice that reads the same as sent as another option: its text, and the keys it reads like. */
export type SentTwins = ReadonlyMap<string, { text: string; others: readonly string[] }>;

/**
 * The options of `question` that read the same as sent. Redaction, PII masks and cuts run after the caller kept one
 * line per twin group, so two lines code tells apart can leave as one text (`link "[email]"` twice). The model sees
 * only what was sent and cannot tell those apart.
 */
export function sentTwins(request: ApprovedRequest, question: string): SentTwins {
  const twins = new Map<string, { text: string; others: readonly string[] }>();
  const asked = request.questions[question];
  if (asked?.type !== 'choice') return twins;
  const byText = new Map<string, string[]>();
  for (const [key, text] of Object.entries(asked.criteria)) byText.set(text, [...(byText.get(text) ?? []), key]);
  for (const keys of byText.values()) {
    if (keys.length < 2) continue;
    for (const key of keys) twins.set(key, { text: asked.criteria[key] ?? '', others: keys.filter((other) => other !== key) });
  }
  return twins;
}

/**
 * The twin rule (spec §8.1 invariant 7, §8.2 step 9) on what the model saw: a pick of an option that reads the same
 * as another is not a pick of either, so it abstains as `twins`, quoting the lean and the threshold it met.
 */
export function stopSentTwin<Out>(verdict: Verdict<Out>, twins: SentTwins): Verdict<Out> {
  if (verdict.kind !== 'answer' || verdict.index === null) return verdict;
  const twin = twins.get(verdict.index);
  if (twin === undefined) return verdict;
  const more = twin.others.length === 1 ? 'another option' : `${twin.others.length} other options`;
  return {
    kind: 'abstain',
    cause: 'twins',
    detail: `picked ${quoteOption(twin.text)}, which reads the same as ${more} as sent: the model could not tell them apart`,
    leaned: verdict.index,
    confidence: verdict.confidence,
    threshold: verdict.threshold,
    ...(verdict.ranking === undefined ? {} : { ranking: verdict.ranking }),
  };
}
