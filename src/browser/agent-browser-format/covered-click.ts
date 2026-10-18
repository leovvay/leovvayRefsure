/**
 * agent-browser 0.27.2 hit-tests a click's point before it sends any input (`check_node_interception` in
 * cli/src/native/element.rs): when another element would take the click, it answers `Element '<ref>' is covered by
 * <tag#id> at its click point, …` and dispatches nothing; it has only scrolled the element into view. The ref is
 * the caller's own, so no page text can forge the prefix; the tag and id after it are page text. 0.27.0 has no such
 * check: there the click lands on whatever covers the point.
 */
export const COVERED_CLICK = /^Element '@?e\d+' is covered by <([^>]{1,200})>/;

/** The element agent-browser found over the click point (page text), or null when the answer is something else. */
export function coveredBy(message: string): string | null {
  return COVERED_CLICK.exec(message)?.[1] ?? null;
}
