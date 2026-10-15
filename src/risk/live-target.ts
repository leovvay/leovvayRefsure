import type { LiveName } from './live-name';

/**
 * A live ref as read without a snapshot (spec §8.3 live-ref path): the names it shows, the explicit role it carries
 * (`link` for an element with an href), and the page's body text, which the confirm-dialog raiser reads for cues.
 */
export interface LiveTarget {
  live: LiveName;
  /** The element's own `role` when it gives one, `link` when it has an href; else null (the action's role is used). */
  role: string | null;
  bodyText: string;
}
