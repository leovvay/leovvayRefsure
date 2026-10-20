import type { Next } from '../../output';

/** What to say and hand over when an Orca tab takes no input, as `headlessRerun` builds it. */
export interface HeadlessRerun {
  /** The sentence for `why.detail`: the exact commands, never a step that shows or focuses anything. */
  text: string;
  /** `open_session` with the exact `open` command; null when no agent-browser binary was found. */
  next: Next | null;
}
