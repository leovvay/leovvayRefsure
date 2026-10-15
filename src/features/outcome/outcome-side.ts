import type { CommandOutcome } from '../../cli';
import { boundText, cleanEgressText } from '../../egress';
import { RE_OBSERVE } from '../../output';
import { cutPieces, fold, norm, valuePieces } from '../../page-model';
import { BOUNDS } from '../../questions';
import { escapeRegExp } from '../../shared';
import type { AbstainWhy, PageReading } from '../shared';

const TITLE_MAX = 300;

/** How long the page gets to show an act's effect before the after-read (spec §6.2): `outcome` and `act --verify`. */
export const SETTLE_MS = 600;
/** Under `--dry-run` nothing is acted on, so the after-side can only be a stand-in. */
const AFTER_UNREAD = `(the page as it reads ${SETTLE_MS} ms after the act; under --dry-run nothing is acted on or read)`;
/** A filled value too short to cut out of the text without cutting words: the text it shows in is not sent. */
const WITHHELD = '(withheld: this text shows the value that was filled or selected, which is never sent)';

/** A page as one side of the outcome Decision: URL, title, then the visible text. Empty fields are left out. */
export function outcomeSide(view: { url: string; title: string; text: string }): string {
  const lines: string[] = [];
  if (view.url !== '') lines.push(`url: ${view.url}`);
  if (view.title !== '') lines.push(`title: ${view.title}`);
  lines.push('visible_text:', view.text);
  return lines.join('\n');
}

/**
 * `text` without the value the act filled or selected (spec §7.3: a typed value is never sent), cut out line by
 * line, case ignored. A widget that mirrors the typing (a contenteditable, a live preview) shows it in the body
 * text. A value too short to cut withholds the whole text it shows in as a word.
 */
function withoutValue(text: string, value: string | undefined): string {
  if (value === undefined || norm(value) === '') return text;
  const pieces = valuePieces([value]);
  if (pieces.length > 0) return cutPieces(text, pieces);
  const word = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(fold(value))}(?![\\p{L}\\p{N}])`, 'u');
  return word.test(fold(text)) ? WITHHELD : text;
}

/**
 * A live reading cleaned for egress (spec §7.3): the value a fill or select typed cut out, then URL, title and text
 * redacted, and masked when PII masks are on, before anything is cut; a cut secret no longer matches its shape.
 * The site cuts the whole side to 4,000.
 */
function cleanSide(
  reading: PageReading, piiMasks: boolean, value?: string,
): { url: string; title: string; text: string } {
  return {
    url: boundText(cleanEgressText(reading.tab.url, piiMasks), { max: BOUNDS.URL_MAX, inline: true }),
    title: boundText(cleanEgressText(withoutValue(reading.tab.title, value), piiMasks), { max: TITLE_MAX, inline: true }),
    text: cleanEgressText(withoutValue(reading.text, value), piiMasks),
  };
}

/**
 * The outcome Decision's input for one act (`outcome -- <verb>` and `act --verify`): the intent, the element acted
 * on, and both sides cleaned (`cleanSide`). `after` is null under `--dry-run`, where only a stand-in can be shown.
 */
export function outcomeInput(
  intent: string, acted: string, before: PageReading, after: PageReading | null,
  opts: { piiMasks: boolean; value?: string | undefined },
) {
  const side = (reading: PageReading): string => outcomeSide(cleanSide(reading, opts.piiMasks, opts.value));
  return {
    intent,
    acted,
    before: side(before),
    after: after === null ? outcomeSide({ url: '', title: '', text: AFTER_UNREAD }) : side(after),
  };
}

/**
 * A dispatched act the outcome Decision did not confirm: `effect_unknown` (exit 30), never "failed" (spec §8.1
 * rule 6), with the Decision's own cause, and a fresh look as the way on.
 */
export function unconfirmed<Result>(result: Result, why: AbstainWhy): CommandOutcome<Result> {
  return {
    status: 'effect_unknown',
    acted: true,
    effect: 'dispatched',
    result,
    why: { cause: 'effect_unknown', detail: `dispatched; not confirmed (${why.cause}): ${why.detail}` },
    next: RE_OBSERVE,
  };
}
