import { dismissSite, locateSite, NONE_KEY, outcomeSite, pageStateSite } from '../../../src/questions';
import type { DecisionAnswer, PresentedCandidates } from '../../../src/questions';
import type { BuiltItem } from './built-item';
import type { CalibItem } from './calib-item';

/** Sites whose candidates are shuffled: the salt picks the order. Elsewhere the salt only names a repeat. */
export const SHUFFLED: ReadonlySet<string> = new Set(['locate', 'dismiss']);

function readCandidate(context: PresentedCandidates) {
  return (answer: DecisionAnswer | undefined) => {
    if (answer?.type !== 'choice') return { choice: null, confidence: null };
    if (answer.choice === NONE_KEY) return { choice: NONE_KEY, confidence: answer.confidence };
    const index = context.indexOf(answer.choice);
    return { choice: index === null ? 'invalid' : String(index), confidence: answer.confidence };
  };
}

/** The request refsure's site builds for this item in the salted order, and its reader. */
export function buildItem(item: CalibItem, salt: string): BuiltItem {
  switch (item.site) {
    case 'locate': {
      const { request, context } = locateSite.build({ ...item.input, order: { kind: 'shuffled', salt } });
      return { site: 'locate', question: locateSite.question, wording: locateSite.wording.hash, request, read: readCandidate(context) };
    }
    case 'dismiss': {
      const { request, context } = dismissSite.build({ ...item.input, order: { kind: 'shuffled', salt } });
      return { site: 'dismiss', question: dismissSite.question, wording: dismissSite.wording.hash, request, read: readCandidate(context) };
    }
    case 'page-state': {
      const { request } = pageStateSite.build(item.input);
      const wording = (pageStateSite.wordingFor?.(item.input) ?? pageStateSite.wording).hash;
      return {
        site: 'page-state', question: pageStateSite.question, wording, request,
        read: (answer) => (answer?.type === 'choice'
          ? { choice: answer.choice, confidence: answer.confidence }
          : { choice: null, confidence: null }),
      };
    }
    case 'outcome': {
      const { request } = outcomeSite.build(item.input);
      return {
        site: 'outcome', question: outcomeSite.question, wording: outcomeSite.wording.hash, request,
        read: (answer) => (answer?.type === 'noul'
          ? { choice: answer.noul >= 0.5 ? 'true' : 'false', confidence: answer.noul, noul: answer.noul }
          : { choice: null, confidence: null }),
      };
    }
  }
}
