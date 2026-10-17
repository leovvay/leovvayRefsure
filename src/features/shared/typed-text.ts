/**
 * What was typed into the page's editable regions, read without a snapshot (spec §7.3: typed values are never sent):
 * the pieces to cut out of the body text before it leaves and the texts too short to cut (`shortPieces`), or why
 * they could not be read. When they could not be read, or a short one shows in the body text as a word, the body
 * text is withheld from the Decision (`typedWithheld`).
 */
export type TypedText = { pieces: readonly string[]; short: readonly string[] } | { unread: string };
