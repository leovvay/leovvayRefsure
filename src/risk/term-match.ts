import { fold } from '../page-model';
import { LEXICONS } from './lexicons';

/** The word lists of a lexicon, by field. */
export type TermField =
  | 'money' | 'irreversible' | 'auth' | 'consent' | 'dismissClose' | 'dismissVeto' | 'cancelContext'
  | 'cancelVerbs' | 'cancelWords' | 'confirmCue';

/** Which language and which term matched, both `fold`ed. */
export interface TermHit { lang: string; term: string }

interface Matcher { re: RegExp; langOf: ReadonlyMap<string, string> }

const matchers = new Map<TermField, Matcher>();

function escapeTerm(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * One regex per field over the union of every lexicon (spec §8.5): a term matches only on a Unicode word
 * boundary, `(?<![\p{L}\p{N}])term(?![\p{L}\p{N}])`, so "sent" never matches inside "consent". Longer terms come
 * first, so the reason names "accept all" rather than "accept".
 */
function matcherFor(field: TermField): Matcher {
  const known = matchers.get(field);
  if (known !== undefined) return known;
  const langOf = new Map<string, string>();
  for (const lexicon of LEXICONS) {
    for (const raw of lexicon[field]) {
      const term = fold(raw);
      if (term !== '' && !langOf.has(term)) langOf.set(term, lexicon.lang);
    }
  }
  const terms = [...langOf.keys()].sort((a, b) => b.length - a.length).map(escapeTerm);
  const source = terms.length === 0 ? '(?!)' : `(?<![\\p{L}\\p{N}])(?:${terms.join('|')})(?![\\p{L}\\p{N}])`;
  const matcher: Matcher = { re: new RegExp(source, 'u'), langOf };
  matchers.set(field, matcher);
  return matcher;
}

/** The first term of `field` found in `folded` (text already passed through `fold`), or null. */
export function findTerm(field: TermField, folded: string): TermHit | null {
  if (folded === '') return null;
  const { re, langOf } = matcherFor(field);
  const found = re.exec(folded);
  if (found === null) return null;
  return { lang: langOf.get(found[0]) ?? '?', term: found[0] };
}

type LooseMatcher = { re: RegExp; hitOf: ReadonlyMap<string, TermHit> };

const looseMatchers = new Map<TermField, LooseMatcher>();

function looseMatcherFor(field: TermField): LooseMatcher {
  const known = looseMatchers.get(field);
  if (known !== undefined) return known;
  const hitOf = new Map<string, TermHit>();
  const { langOf } = matcherFor(field);
  for (const [term, lang] of langOf) {
    const key = term.replace(/\s+/gu, '');
    if (key !== '' && !hitOf.has(key)) hitOf.set(key, { lang, term });
  }
  const terms = [...langOf.keys()].sort((a, b) => b.length - a.length)
    .map((term) => escapeTerm(term).replace(/\s+/gu, '\\s*'));
  const alt = terms.length === 0 ? '(?!)' : `(?:${terms.join('|')})`;
  const source = `(?<![\\p{L}\\p{N}])${alt}|${alt}(?![\\p{L}\\p{N}])`;
  const matcher: LooseMatcher = { re: new RegExp(source, 'u'), hitOf };
  looseMatchers.set(field, matcher);
  return matcher;
}

/**
 * `findTerm` for text whose spacing may be gone. Orca's snapshot text drops a no-break space from every name, and
 * a node without a ref has no `refs` entry to take its spacing back from: `Permanently&nbsp;delete?` reads
 * `permanentlydelete?`. So a term's own spaces may be missing, and a word boundary on one side is enough.
 * It also reads inflections ("deleted"); that only ever raises a class, never lowers one.
 */
export function findTermLoose(field: TermField, folded: string): TermHit | null {
  if (folded === '') return null;
  const { re, hitOf } = looseMatcherFor(field);
  const found = re.exec(folded);
  if (found === null) return null;
  return hitOf.get(found[0].replace(/\s+/gu, '')) ?? { lang: '?', term: found[0] };
}
