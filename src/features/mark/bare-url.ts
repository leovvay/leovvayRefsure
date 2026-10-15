import { boundText, cleanEgressText } from '../../egress';

/**
 * A URL as a mark keeps it and triage shows it (spec §6.3, §8.7): no query, fragment or credentials, since a query
 * often carries tokens and nothing here needs one; then redacted and PII-masked (masks always on), since a path can
 * carry a token too; then cut to `max`. Cleaning comes first: a secret cut in half no longer matches its shape.
 * Text that is not a URL is cut at its first `?` or `#`.
 */
export function bareUrl(url: string, opts: { max: number }): string {
  const text = url.trim();
  let bare = text.split(/[?#]/, 1)[0] ?? '';
  try {
    const parsed = new URL(text);
    if (parsed.origin !== 'null') {
      bare = `${parsed.origin}${parsed.pathname}`;
    } else {
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      bare = parsed.href;
    }
  } catch {
    // Not a URL: the cut at the first `?` or `#` stands.
  }
  return boundText(cleanEgressText(bare, true), { max: opts.max, inline: true });
}
