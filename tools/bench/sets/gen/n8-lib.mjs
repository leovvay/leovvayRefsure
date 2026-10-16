// n8 generator helpers: refsure's fold and content words (ported from src/page-model, so the provisional option
// order matches `pick-option`'s ranking), the five-language tuple reader, and the provisional field line.
export { esc, rngFrom } from './n5-lib.mjs';

export const LANGS = ['en', 'uk', 'de', 'es', 'pl'];

/** `'en|uk|de|es|pl'` -> { en, uk, de, es, pl }; one value for all five when there is no `|`. */
export function T(text) {
  const parts = text.split('|');
  if (parts.length === 1) return Object.fromEntries(LANGS.map((l) => [l, text]));
  if (parts.length !== 5) throw new Error(`five languages expected: ${text}`);
  return Object.fromEntries(LANGS.map((l, i) => [l, parts[i]]));
}

const APOSTROPHES = /[‘’‛ʼ´`｀]/g;
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

export function norm(s) {
  return s.normalize('NFKC').replace(/­/g, '').replace(ZERO_WIDTH, ' ').replace(/\s+/gu, ' ').trim();
}

export function fold(s) {
  return norm(s.replace(APOSTROPHES, "'")).toLowerCase();
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'are', 'its', 'into', 'our', 'then',
  'для', 'що', 'від', 'або', 'які', 'який', 'яка', 'яке', 'цей', 'щоб', 'при',
  'для', 'что', 'это', 'или', 'как', 'при', 'чтобы', 'который', 'которая',
  'der', 'die', 'das', 'und', 'für', 'mit', 'von', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'oder', 'zum', 'zur',
  'los', 'las', 'del', 'con', 'para', 'por', 'que', 'una', 'uno', 'unos', 'unas', 'sus',
  'les', 'des', 'pour', 'avec', 'une', 'que', 'qui', 'dans', 'sur', 'aux', 'vos', 'votre',
  'dla', 'nie', 'się', 'jest', 'oraz', 'lub', 'ten', 'tak', 'aby', 'przy',
]);

export function contentWords(text) {
  const seen = new Set();
  for (const m of fold(text).matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    if (Array.from(m[0]).length < 3 || STOP.has(m[0])) continue;
    seen.add(m[0]);
  }
  return [...seen];
}

/** Option labels as `pick-option` offers them: most content words shared with `want` first, ties in page order. */
export function ranked(labels, want) {
  const w = new Set(contentWords(want));
  const score = (s) => contentWords(s).filter((x) => w.has(x)).length;
  return labels.map((s, k) => ({ s, k, n: score(s) })).sort((a, b) => b.n - a.n || a.k - b.k).map((o) => o.s);
}

/** True when two labels would read as one once folded (the code path or the twin rule would settle them). */
export const foldEq = (a, b) => fold(a) === fold(b);

const COLL = { en: 'en', uk: 'uk', de: 'de', es: 'es', pl: 'pl' };
export const byName = (lang) => (a, b) => a.localeCompare(b, COLL[lang]);

/** The provisional v1 line of a field: the last heading before it in the page (the capture rebuilds it). */
export function fieldLine(html, fieldId, name, inMain = true) {
  let before = html.split(`id="${fieldId}"`)[0];
  // A field in the sidebar is in no place of the line format; only headings in the same sidebar label it.
  if (!inMain) before = before.slice(before.lastIndexOf('<aside'));
  const heads = [...before.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)];
  const last = heads.length ? heads[heads.length - 1][1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() : '';
  const parts = [];
  if (inMain) parts.push('main');
  if (last) parts.push(`heading ${JSON.stringify(last)}`);
  return `combobox ${JSON.stringify(name)} in=${JSON.stringify(parts.join(' > '))}`;
}
