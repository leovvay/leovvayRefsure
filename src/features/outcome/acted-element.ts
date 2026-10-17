/**
 * The element an act pressed, as the outcome Decision's `acted_element` names it (`outcomeInput`): its role, and the
 * names it showed, the one a browser would give it first. An editable region with no label is named by its own
 * text, which is typing, so the names are cut as the page sides are before one is sent (spec §7.3).
 */
export interface ActedElement { role: string; names: readonly string[] }
