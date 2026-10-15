import { cleanEgressText } from '../egress';

/** The longest name a line or a path carries; longer ones end in `…` (the earlier descriptor lines' cut). */
export const NAME_MAX = 90;

// Zero-width characters become spaces, so `Save\u200Bnow` reads as two words, as a person sees it.
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
// A soft hyphen only marks where a word may break; it is dropped, never turned into a space.
const SOFT_HYPHEN = /\u00AD/g;
// Typographic apostrophes a page spells "J’accepte" or "can’t" with: left and right single quotes, the reversed
// quote, the modifier letter apostrophe (Ukrainian), the acute and grave accents and the fullwidth grave. NFKC
// leaves them apart from `'` (and splits the acute into a space and a combining mark), so `fold` maps them first.
const APOSTROPHES = /[\u2018\u2019\u201B\u02BC\u00B4\u0060\uFF40]/g;

/** NFKC; NBSP and zero-width characters become spaces; whitespace collapsed; trimmed (spec §8.3). */
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(SOFT_HYPHEN, '')
    .replace(ZERO_WIDTH, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * `norm` with every typographic apostrophe read as `'`, then lower case, so "J’accepte" matches the lexicon's
 * "j'accepte". `norm` keeps the apostrophe the page shows: a fingerprint name stays what the page says.
 * `toLowerCase` rather than `toLocaleLowerCase`: a Turkish host locale would fold `I` to a dotless `ı`, and a
 * match must not depend on where refsure runs. `І` still folds to `і`.
 */
export function fold(s: string): string {
  return norm(s.replace(APOSTROPHES, "'")).toLowerCase();
}

// What no person sees: format characters (zero-width space and joiners, bidi marks, the BOM) and the other
// default-ignorable code points (soft hyphen, variation selectors, the combining grapheme joiner, fillers).
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/**
 * `fold` with every invisible character dropped, never spaced: `Acc&#8203;ept` (a zero-width space inside the
 * word) reads `accept` here and `acc ept` through `fold`; a bidi mark, which `fold` keeps, goes too. A zero-width
 * character may part two words or sit inside one, and a person sees neither, so the risk lexicons read a name
 * both ways (`readingsOf`).
 */
export function foldVisible(s: string): string {
  return fold(s.replace(INVISIBLE, ''));
}

/**
 * Cuts at `NAME_MAX` code points, so a cut never splits a surrogate pair. Page text that is cut is cleaned first
 * (spec §7.3): secrets redacted and PII masked, whatever the config, since the part a cut leaves of a key or an
 * e-mail no longer matches its shape, and the egress pipeline could not catch it later. Uncut text is left as is.
 */
export function cutName(s: string, max = NAME_MAX): string {
  return Array.from(s).length <= max ? s : cutShown(cleanEgressText(s, true), max);
}

/**
 * `cutName` without the cleaning, for text only the agent reads and types back: the twin rows `--within` matches
 * against the page itself. It never leaves the machine.
 */
export function cutShown(s: string, max = NAME_MAX): string {
  const points = Array.from(s);
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : s;
}

/**
 * Origin + path + query. The fragment is kept only when the path is `/` or empty, where it is usually the route
 * of a single-page app. Credentials in the URL never survive.
 */
export function urlNorm(u: string): string {
  let url: URL;
  try {
    url = new URL(u.trim());
  } catch {
    return u.trim();
  }
  const hash = url.pathname === '/' || url.pathname === '' ? url.hash : '';
  if (url.origin !== 'null') return `${url.origin}${url.pathname}${url.search}${hash}`;
  url.username = '';
  url.password = '';
  url.hash = '';
  return `${url.href}${hash}`;
}
