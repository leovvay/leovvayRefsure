/** What both outcome modes hold the page to: the intent, and the code rules that settle `landed` with no Decision. */
export interface OutcomeCheck {
  /** What should happen, in a few words; the outcome Decision's `step_intent`. */
  intent: string;
  /** `--expect-url`: a glob (`*` is any run) that matches the URL after and did not before. */
  expectUrl: string | null;
  /** `--expect-text`: text that was absent before and is present after, `fold`-matched. */
  expectText: string | null;
}
