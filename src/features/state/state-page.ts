import { boundText, maskPii, redactSecrets, stripControl } from '../../egress';
import type { PageView } from '../../page-model';
import { BOUNDS } from '../../questions';

/** A named line of the block, left out when it has nothing to say, as the dataset leaves it out. */
function field(name: string, values: readonly string[]): string[] {
  const shown = values.map((value) => value.replace(/\s+/g, ' ').trim()).filter((value) => value !== '');
  return shown.length > 0 ? [`${name}: ${shown.join(' | ')}`] : [];
}

/**
 * The `page` a `state` Decision reads, in the research dataset's own layout and field names: `url`, `title`,
 * `headings`, `alerts_and_toasts`, `dialogs`, then `visible_text` cut to 1,500 characters (the production page
 * view's cap). The text is redacted, and masked when PII masks are on, before the cut: a cut secret or e-mail no
 * longer matches its shape, so it could pass the egress pipeline half-hidden.
 */
export function statePage(view: PageView, piiMasks: boolean): string {
  const redacted = redactSecrets(stripControl(view.text));
  const clean = piiMasks ? maskPii(redacted) : redacted;
  const text = boundText(clean, { max: BOUNDS.STATE_PAGE_TEXT_MAX });
  return [
    ...field('url', [view.url]),
    ...field('title', [view.title]),
    ...field('headings', view.headings),
    ...field('alerts_and_toasts', view.alerts),
    ...field('dialogs', view.dialogs),
    'visible_text:',
    text,
  ].join('\n');
}
