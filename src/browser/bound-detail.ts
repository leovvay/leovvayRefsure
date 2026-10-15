const DETAIL_MAX = 300;

/** A backend's error text on one line, cut to a bounded length for an envelope's `why.detail`. */
export function boundDetail(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > DETAIL_MAX ? `${flat.slice(0, DETAIL_MAX - 1)}…` : flat;
}
