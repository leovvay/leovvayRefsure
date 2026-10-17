import type { CommandOutcome } from '../../cli';
import { boundText, cleanEgressText } from '../../egress';
import { RE_OBSERVE } from '../../output';
import { cutPieces, norm, showsAsWord, valuePieces } from '../../page-model';
import { BOUNDS } from '../../questions';
import { type AbstainWhy, type PageReading, typedWithheld, withoutTyped } from '../shared';

const TITLE_MAX = 300;

/** How long the page gets to show an act's effect before the after-read (spec §6.2): `outcome` and `act --verify`. */
export const SETTLE_MS = 600;
/** Under `--dry-run` nothing is acted on, so the after-side can only be a stand-in. */
const AFTER_UNREAD = `(the page as it reads ${SETTLE_MS} ms after the act; under --dry-run nothing is acted on or read)`;
/** A filled value too short to cut out of the text without cutting words: the text it shows in is not sent. */
const WITHHELD = '(withheld: this text shows the value that was filled or selected, which is never sent)';
/** Why no outcome Decision is asked on a side whose text is withheld, when the URL did not move either. */
const UNJUDGED = 'the page text was withheld on one side (typed or filled text that cannot be cut out) and the URL '
  + 'did not change, so no Decision was asked: it would judge a placeholder';

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
  return showsAsWord(text, [value]) ? WITHHELD : text;
}

/**
 * A live reading cleaned for egress (spec §7.3): what was typed into editable regions and the value a fill or select
 * typed cut out, then URL, title and text redacted, and masked when PII masks are on, before anything is cut; a cut
 * secret no longer matches its shape. The site cuts the whole side to 4,000. `withheld`: the text is a placeholder.
 */
function cleanSide(
  reading: PageReading, piiMasks: boolean, value?: string,
): { url: string; title: string; text: string; withheld: boolean } {
  const text = withoutValue(withoutTyped(reading.text, reading.typed), value);
  return {
    url: boundText(cleanEgressText(reading.tab.url, piiMasks), { max: BOUNDS.URL_MAX, inline: true }),
    title: boundText(cleanEgressText(withoutValue(reading.tab.title, value), piiMasks), { max: TITLE_MAX, inline: true }),
    text: cleanEgressText(text, piiMasks),
    withheld: text === WITHHELD || typedWithheld(reading.text, reading.typed) !== null,
  };
}

/**
 * Whether the outcome Decision has nothing to judge (spec §6.2: nothing looked at the page is no verdict): one
 * side's text is withheld (typed text, or a filled value, too short or unread to cut out) and the URL it would see
 * did not change. Asking would pay for a verdict on a placeholder.
 */
export function withheldUnmoved(
  before: PageReading, after: PageReading, opts: { piiMasks: boolean; value?: string | undefined },
): boolean {
  const a = cleanSide(before, opts.piiMasks, opts.value);
  const b = cleanSide(after, opts.piiMasks, opts.value);
  return a.url === b.url && (a.withheld || b.withheld);
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
 * An act whose outcome no Decision may judge (`withheldUnmoved`, or a withheld side of a mark): `effect_unknown`
 * (exit 30) with nothing asked and nothing spent, and a fresh look as the way on. `acted`: refsure dispatched it.
 */
export function unjudged<Result>(result: Result, acted: boolean): CommandOutcome<Result> {
  return {
    status: 'effect_unknown',
    acted,
    effect: acted ? 'dispatched' : 'none',
    result,
    why: { cause: 'effect_unknown', detail: `${acted ? 'dispatched; ' : ''}not confirmed: ${UNJUDGED}` },
    next: RE_OBSERVE,
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
