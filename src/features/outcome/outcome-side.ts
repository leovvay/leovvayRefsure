import { boundText, cleanEgressText } from '../../egress';
import { BOUNDS } from '../../questions';
import type { PageReading } from '../shared';

const TITLE_MAX = 300;

/** A page as one side of the outcome Decision: URL, title, then the visible text. Empty fields are left out. */
export function outcomeSide(view: { url: string; title: string; text: string }): string {
  const lines: string[] = [];
  if (view.url !== '') lines.push(`url: ${view.url}`);
  if (view.title !== '') lines.push(`title: ${view.title}`);
  lines.push('visible_text:', view.text);
  return lines.join('\n');
}

/**
 * A live reading cleaned for egress (spec §7.3): URL, title and text redacted, and masked when PII masks are on,
 * before anything is cut; a cut secret no longer matches its shape. The site cuts the whole side to 4,000.
 */
export function cleanSide(reading: PageReading, piiMasks: boolean): { url: string; title: string; text: string } {
  return {
    url: boundText(cleanEgressText(reading.tab.url, piiMasks), { max: BOUNDS.URL_MAX, inline: true }),
    title: boundText(cleanEgressText(reading.tab.title, piiMasks), { max: TITLE_MAX, inline: true }),
    text: cleanEgressText(reading.text, piiMasks),
  };
}
