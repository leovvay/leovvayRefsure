import { fold, foldVisible } from '../page-model';
import { escapeRegExp } from '../shared';
import { LEXICONS } from './lexicons';
import type { TermField, TermHit } from './term-hit';

interface Matcher { re: RegExp; langOf: ReadonlyMap<string, string> }

const matchers = new Map<TermField, Matcher>();

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
  const terms = [...langOf.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
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
    .map((term) => escapeRegExp(term).replace(/\s+/gu, '\\s*'));
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

/**
 * The readings of a raw name or text the lexicons are matched in: `fold`, where a zero-width character is a
 * space, and `foldVisible`, where it is nothing, as a person sees it (`Acc&#8203;ept` is "accept"). One reading
 * when both agree. Pass the raw text: once `fold`ed, the invisible characters are spaces and the second is lost.
 */
export function readingsOf(raw: string): string[] {
  const spaced = fold(raw);
  const seen = foldVisible(raw);
  return seen === spaced ? [spaced] : [spaced, seen];
}

/**
 * A term that raises risk or refuses (a lexicon class, the dismiss veto, a confirm cue) in raw text: found in
 * any reading. `loose` matches as `findTermLoose`.
 */
export function findTermAnyReading(field: TermField, raw: string, opts: { loose?: boolean } = {}): TermHit | null {
  const find = opts.loose === true ? findTermLoose : findTerm;
  for (const reading of readingsOf(raw)) {
    const hit = find(field, reading);
    if (hit !== null) return hit;
  }
  return null;
}

/**
 * Words a back-out control may carry beside its close, cancel or reject word and still be only that: what it closes
 * ("Close dialog", "No, close this"), or that the page goes on ("Continue without accepting" reads as a reject
 * after `continue`). Any other word names what the control acts on: "Close project", "Yes, cancel", "End meeting".
 */
const BARE_WORDS: ReadonlySet<string> = new Set([
  'this', 'the', 'it', 'and', 'dialog', 'window', 'popup', 'pop-up', 'modal', 'banner', 'message', 'notice', 'panel',
  'overlay', 'menu', 'continue', 'continuer', 'weiter', 'continuar', 'kontynuuj', 'продолжить', 'продовжити',
]);

/** A folded text as the whole-name match reads it: words, punctuation dropped (`×` and its kin are words here). */
function wordsOf(folded: string): string[] {
  return folded.replace(/[^\p{L}\p{M}\p{N}×✕✖'-]+/gu, ' ').trim().split(' ').filter((word) => word !== '');
}

type WholeTerm = { words: readonly string[]; hit: TermHit };

const wholeTerms = new Map<string, readonly WholeTerm[]>();

/** The terms of `fields` as word lists, longest first, so "no thanks" is read before "no". */
function wholeTermsFor(fields: readonly TermField[]): readonly WholeTerm[] {
  const key = fields.join('+');
  const known = wholeTerms.get(key);
  if (known !== undefined) return known;
  const out: WholeTerm[] = [];
  for (const field of fields) {
    for (const [term, lang] of matcherFor(field).langOf) out.push({ words: wordsOf(term), hit: { lang, term } });
  }
  const built = out.filter((t) => t.words.length > 0).sort((a, b) => b.words.length - a.words.length);
  wholeTerms.set(key, built);
  return built;
}

/**
 * Whether a folded text is, as a whole, a term of `fields` (or several, "No, cancel"), with nothing beside them
 * but `BARE_WORDS`; the first term read, or null. "Close" and "Close dialog" are; "Close project" is not.
 */
export function findWholeTerm(fields: readonly TermField[], folded: string): TermHit | null {
  const words = wordsOf(folded);
  const terms = wholeTermsFor(fields);
  let first: TermHit | null = null;
  for (let at = 0; at < words.length;) {
    const term = terms.find((t) => t.words.every((word, k) => words[at + k] === word));
    if (term !== undefined) {
      first ??= term.hit;
      at += term.words.length;
    } else if (BARE_WORDS.has(words[at]!)) {
      at += 1;
    } else {
      return null;
    }
  }
  return first;
}

/**
 * A name that lowers risk or grants authority (a close, reject or cancel control) in raw text: the whole name is
 * such a term (`findWholeTerm`), in every reading, so neither a word beside it ("Close project") nor an invisible
 * character makes a control read calmer than a person sees it. The first reading's hit.
 */
export function findWholeTermEveryReading(fields: readonly TermField[], raw: string): TermHit | null {
  let first: TermHit | null = null;
  for (const reading of readingsOf(raw)) {
    const hit = findWholeTerm(fields, reading);
    if (hit === null) return null;
    first ??= hit;
  }
  return first;
}
