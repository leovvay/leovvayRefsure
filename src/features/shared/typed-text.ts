/**
 * What was typed into the page's editable regions, read without a snapshot (spec §7.3: typed values are never sent):
 * the pieces to cut out of the body text before it leaves, or why they could not be read, in which case the body
 * text is withheld from the Decision.
 */
export type TypedText = { pieces: readonly string[] } | { unread: string };
