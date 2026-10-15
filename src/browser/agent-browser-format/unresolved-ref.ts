/**
 * agent-browser 0.27 answers with a message, not a code (probed live). It resolves a ref before it touches the
 * page: `Unknown ref: eN` when the last snapshot had no such ref, `Could not locate element with role=… name=…` when
 * that element is gone. Both are refused before dispatch. Orca 1.4 passes the second on unchanged, as `browser_error`.
 */
export const UNRESOLVED_REF = /^Unknown ref\b|^Could not locate element\b/i;
