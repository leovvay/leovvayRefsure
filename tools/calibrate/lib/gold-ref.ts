/**
 * What a set says the right answer is, before the page is snapshotted: an element by role, name and ordinal (the
 * Orca-native replay maps it onto the live lines), no element (`none`), or a key (a page state, `true`/`false`).
 * `path` narrows an element to one place when the set gives one; `ordinal` counts the elements of that role and
 * name (and path, when given) in page order, from 1. When the page shows more of them than the set's list had
 * (`of`), only those in the places `hint` names (dialog, navigation, main, …) are counted.
 */
export type GoldRef =
  | {
    kind: 'element'; role: string; name: string; ordinal: number; path?: string;
    /** From a descriptor: how many of its role and name the set's own list had, and its v1 path there. */
    of?: number; hint?: string;
  }
  | { kind: 'none' }
  | { kind: 'key'; value: string };
