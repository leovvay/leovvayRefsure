import { dismissSite, findSite, locateSite, NONE_KEY, outcomeSite, pageStateSite, presenceSite } from '../../../src/questions';
import type { DecisionAnswer, DecisionSite, PresentedCandidates } from '../../../src/questions';
import type { BuiltItem } from './built-item';
import type { CalibItem } from './calib-item';

/** A Noul probability read as a key: `true` at 0.5 and above. Parity and the replay score Nouls by it. */
export function noulKey(probability: number): 'true' | 'false' {
  return probability >= 0.5 ? 'true' : 'false';
}

function readNoul(answer: DecisionAnswer | undefined) {
  return answer?.type === 'noul'
    ? { choice: noulKey(answer.noul), confidence: answer.noul, noul: answer.noul }
    : { choice: null, confidence: null };
}

function readCandidate(context: PresentedCandidates) {
  return (answer: DecisionAnswer | undefined) => {
    if (answer?.type !== 'choice') return { choice: null, confidence: null };
    if (answer.choice === NONE_KEY) return { choice: NONE_KEY, confidence: answer.confidence };
    const index = context.indexOf(answer.choice);
    return { choice: index === null ? 'invalid' : String(index), confidence: answer.confidence };
  };
}

/** A candidate site (locate, find, dismiss) in the order the salt shuffles; the read maps keys back to indices. */
function shuffled<In>(site: DecisionSite<In, PresentedCandidates, number>, input: Omit<In, 'order'>, salt: string): BuiltItem {
  const { request, context } = site.build({ ...input, order: { kind: 'shuffled', salt } } as In);
  return { site: site.id, question: site.question, wording: site.wording.hash, request, read: readCandidate(context) };
}

/**
 * The request refsure's site builds for this item, and its reader. Candidate sites are shuffled by the salt; for
 * the others the salt only names a repeat.
 */
export function buildItem(item: CalibItem, salt: string): BuiltItem {
  switch (item.site) {
    case 'locate':
      return shuffled(locateSite, item.input, salt);
    case 'find':
      return shuffled(findSite, item.input, salt);
    case 'dismiss':
      return shuffled(dismissSite, item.input, salt);
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
      return { site: 'outcome', question: outcomeSite.question, wording: outcomeSite.wording.hash, request, read: readNoul };
    }
    case 'presence': {
      const { request } = presenceSite.build(item.input);
      return { site: 'presence', question: presenceSite.question, wording: presenceSite.wording.hash, request, read: readNoul };
    }
  }
}
