import { norm } from '../../page-model';

/**
 * Free text for a next step's argv, as the verb will read it: `norm`ed (so nothing changes once it is parsed), and
 * when longer than `max` (`--intent` and `--expect-name` take 300) cut at the last space within it, with no
 * ellipsis: an ellipsis would grow under NFKC past the bound, and a name cut between words still matches as whole
 * words.
 */
export function argText(text: string, max: number): string {
  const whole = norm(text);
  if (whole.length <= max) return whole;
  let cut = '';
  for (const point of whole) {
    if (cut.length + point.length > max) break;
    cut += point;
  }
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}
