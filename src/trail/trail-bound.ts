import { cutName, dropInvisible, norm } from '../page-model';

/** The longest element name a row carries (spec trail v1, decision 5). */
const NAME_MAX = 80;
const ROLE_MAX = 24;
const WORD_MAX = 32;
/** The contract's cap on `verb`. */
const VERB_MAX = 16;
const CONTROL = /\p{Cc}/gu;
/** A ref as Orca's snapshot prints it; anything else is no ref. */
const REF = /^e\d{1,9}$/;

/**
 * Page text as a row carries it: control characters spaced, every invisible and bidi format character dropped (a
 * bidi override would reorder the row it sits in), whitespace collapsed, then `cutName`, which redacts secrets and
 * masks PII in a text it cuts. Empty reads as null.
 */
function cleaned(s: string, max: number): string | null {
  const text = cutName(norm(dropInvisible(s.replace(CONTROL, ' '))), max);
  return text === '' ? null : text;
}

export function boundName(name: string | null | undefined): string | null {
  return typeof name === 'string' ? cleaned(name, NAME_MAX) : null;
}

export function boundRole(role: string | null | undefined): string | null {
  return typeof role === 'string' ? cleaned(role, ROLE_MAX) : null;
}

/** A model or site name: refsure's own words, bounded all the same. */
export function boundWord(word: string | null | undefined): string | undefined {
  return typeof word === 'string' ? cleaned(word, WORD_MAX) ?? undefined : undefined;
}

export function boundVerb(verb: string): string {
  return cleaned(verb, VERB_MAX) ?? '?';
}

export function boundRef(ref: string | null): string | null {
  return ref !== null && REF.test(ref) ? ref : null;
}

/** Whole ms (or a count), never negative; undefined for anything not finite. */
export function boundMs(ms: number | null | undefined): number | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : undefined;
}

/** A confidence or a threshold: 0..1, three decimals; undefined for anything else. */
export function boundUnit(p: number | null | undefined): number | undefined {
  if (typeof p !== 'number' || !Number.isFinite(p)) return undefined;
  return Math.round(Math.min(1, Math.max(0, p)) * 1000) / 1000;
}
