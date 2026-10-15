const OPENING_TAG = /^\s*<[a-z][a-z0-9-]*((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/i;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** The attributes of an element's opening tag, names lower-cased; the first of a repeated name wins, as in HTML. */
export function readTagAttrs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tag = OPENING_TAG.exec(html);
  if (tag === null) return out;
  for (const m of (tag[1] ?? '').matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (!(name in out)) out[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}
