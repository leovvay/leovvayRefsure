import { boundText, cleanEgressText } from '../../egress';
import type { PageView } from '../../page-model';
import { BOUNDS } from '../../questions';

/** A named line of the block, left out when it has nothing to say, as the dataset leaves it out. */
function field(name: string, values: readonly string[]): string[] {
  const shown = values.map((value) => value.replace(/\s+/g, ' ').trim()).filter((value) => value !== '');
  return shown.length > 0 ? [`${name}: ${shown.join(' | ')}`] : [];
}

/**
 * What a `state` Decision reads about the page. `pageUrl` is the URL cut to 300 characters (spec §7.3); `page` is
 * the block in the research dataset's own layout and field names: `url` (that same cut URL), `title`, `headings`,
 * `alerts_and_toasts`, `dialogs`, then `visible_text` cut to 1,500 characters (the production page view's cap).
 * URL and text are cleaned (redacted, and masked when PII masks are on) before the cut: a cut secret or e-mail no
 * longer matches its shape, so it could pass the egress pipeline half-hidden.
 */
export function stateInput(view: PageView, piiMasks: boolean): { pageUrl: string; page: string } {
  const pageUrl = boundText(cleanEgressText(view.url, piiMasks), { max: BOUNDS.URL_MAX, inline: true });
  const text = boundText(cleanEgressText(view.text, piiMasks), { max: BOUNDS.STATE_PAGE_TEXT_MAX });
  const page = [
    ...field('url', [pageUrl]),
    ...field('title', [view.title]),
    ...field('headings', view.headings),
    ...field('alerts_and_toasts', view.alerts),
    ...field('dialogs', view.dialogs),
    'visible_text:',
    text,
  ].join('\n');
  return { pageUrl, page };
}
