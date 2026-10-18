/**
 * What the caller's guard read on the fresh tree for the element it is about to click: its name, and how the caller
 * matches that name in page text. A backend may click by a point on the page instead of through the element only
 * when the element at that point carries this name; otherwise it clicks the element as it would with no binding.
 */
export interface ActBinding {
  name: string;
  /** Whether page text (the element's `aria-label` or its `innerText`) holds `name`, as the caller compares rows. */
  carries(text: string): boolean;
}
