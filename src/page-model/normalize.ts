/** The longest name a line or a path carries; longer ones end in `…` (the earlier descriptor lines' cut). */
export const NAME_MAX = 90;

// Zero-width characters become spaces, so `Save​now` reads as two words, as a person sees it.
const ZERO_WIDTH = /[​-‍⁠﻿]/g;
// A soft hyphen only marks where a word may break; it is dropped, never turned into a space.
const SOFT_HYPHEN = /­/g;

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
 * `norm`, then lower case. `toLowerCase` rather than `toLocaleLowerCase`: a Turkish host locale would fold `I`
 * to a dotless `ı`, and a match must not depend on where refsure runs. `І` still folds to `і`.
 */
export function fold(s: string): string {
  return norm(s).toLowerCase();
}

/** Cuts at `NAME_MAX` code points, so a cut never splits a surrogate pair. */
export function cutName(s: string, max = NAME_MAX): string {
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
