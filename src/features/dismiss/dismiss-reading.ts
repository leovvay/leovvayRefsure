import { findTerm, findWholeTerm, readingsOf, type TermField } from '../../risk';
import { escapeRegExp } from '../../shared';

/**
 * A negation right before a term, in the seven languages refsure reads: en "without", fr "sans", de "ohne" (and
 * "ohne zu"), es "sin", pl "bez", ru and uk "без". `fold`ed, so one space parts it from the term.
 */
const NEGATION = /(?<![\p{L}\p{N}])(?:without|sans|ohne(?: zu)?|sin|bez|без) $/u;
/** The accept terms a negation turns: the consent class and the never-click list. */
const ACCEPT_FIELDS: readonly TermField[] = ['consent', 'dismissVeto'];
/** Classes no wording lowers: "sans acheter" still reads money and stays on the never-click list. */
const KEPT_FIELDS: readonly TermField[] = ['money', 'irreversible', 'auth'];
/** What a negated accept reads as: a reject word of the close lexicon (`dismissClose`, matched across every language). */
const REJECT = 'reject';

/** Where `term` first stands as a whole word in `text`, as the lexicon matcher found it; -1 when nowhere. */
function termAt(text: string, term: string): number {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'u').exec(text)?.index ?? -1;
}

/** The spans `[start, end)` of each negation and the accept term right after it, in one reading. */
function negatedSpans(reading: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const field of ACCEPT_FIELDS) {
    // Each hit is blanked once read, so the next search finds the next one; offsets stay those of `reading`.
    let scan = reading;
    for (let hit = findTerm(field, scan); hit !== null; hit = findTerm(field, scan)) {
      const { term } = hit;
      const at = termAt(scan, term);
      if (at === -1) break;
      const end = at + term.length;
      const negation = NEGATION.exec(reading.slice(0, at));
      if (negation !== null && KEPT_FIELDS.every((kept) => findTerm(kept, term) === null)) spans.push([negation.index, end]);
      scan = `${scan.slice(0, at)}${' '.repeat(term.length)}${scan.slice(end)}`;
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** One `fold`ed reading with each negated accept ("sans accepter", "without consent") replaced by a reject word. */
function rejectReading(reading: string): string {
  let out = '';
  let from = 0;
  for (const [start, end] of negatedSpans(reading)) {
    if (end <= from) continue;
    out += start >= from ? `${reading.slice(from, start)}${REJECT}` : '';
    from = end;
  }
  return from === 0 ? reading : `${out}${reading.slice(from)}`;
}

/**
 * The readings of a raw name (`readingsOf`) with each negated accept read as a reject, when every reading has one;
 * else `null`. A negated accept ("Continuer sans accepter", "Weiter ohne Akzeptieren", "Continue without consent")
 * declines: it is a reject, not an accept. Only a negation right before the term counts ("Accept all without ads"
 * still accepts), never for a money, irreversible or auth term, and only when every reading shows it: a zero-width
 * character that parts "without" from "accept" in one reading only never makes a name read calmer.
 */
export function turnedReadings(raw: string): string[] | null {
  const readings = readingsOf(raw);
  const turned = readings.map(rejectReading);
  return turned.every((reading, k) => reading !== readings[k]) ? turned : null;
}

/** How dismiss reads a name: every reading, each negated accept in it read as a reject. */
export function rejectReadings(raw: string): string[] {
  return turnedReadings(raw) ?? readingsOf(raw);
}

/**
 * The whole name is a close or reject word (`findWholeTerm`: "Close", "Reject all", never "Close project" or
 * "Reject invoice"), in every reading, a negated accept counting as a reject (spec §8.4).
 */
export function closesOrRejects(raw: string): boolean {
  return rejectReadings(raw).every((reading) => findWholeTerm(['dismissClose'], reading) !== null);
}
