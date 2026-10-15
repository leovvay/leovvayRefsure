import type { DecisionSite } from '../decision-site';
import { NONE_KEY, presentCandidates } from '../present-candidates';
import type { CandidateOrder, PresentedCandidates } from '../presented-candidates';
import type { SiteId } from '../site-id';
import type { SitePolicy } from '../site-policy';
import { siteWording } from '../wording-hash';
import { readChoice } from './read-answer';

/** One shuffled Choice over caller lines plus `none`: locate, find, dismiss and option-map differ only in these. */
export interface CandidateSiteSpec<In> {
  id: SiteId;
  question: string;
  instructions: string;
  none: string;
  policy: SitePolicy;
  /** The most lines asked over; more are cut from the end, where a ranked list keeps its weakest. */
  max: number;
  /** The request state from the caller's text, bounded; its values also seed the shuffle. */
  state(input: In): Record<string, string>;
  lines(input: In): readonly string[];
}

export function candidateSite<In extends { order?: CandidateOrder }>(
  spec: CandidateSiteSpec<In>,
): DecisionSite<In, PresentedCandidates, number> {
  return {
    id: spec.id,
    kind: 'choice',
    question: spec.question,
    wording: siteWording('choice', spec.instructions, { [NONE_KEY]: spec.none }),
    policy: spec.policy,
    build(input) {
      const state = spec.state(input);
      const lines = spec.lines(input).slice(0, spec.max);
      const presented = presentCandidates(lines, spec.none, Object.values(state), input.order);
      return {
        request: {
          state,
          questions: { [spec.question]: { type: 'choice', instructions: spec.instructions, criteria: presented.criteria } },
        },
        context: presented,
      };
    },
    read(answer, context, threshold) {
      return readChoice(answer, threshold, (key) => context.indexOf(key), NONE_KEY);
    },
  };
}
