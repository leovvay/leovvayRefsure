/** What a page shows, as the `page-state` site reads it. Never a field value. */
export interface PageView {
  /** `urlNorm`ed. */
  url: string;
  title: string;
  /** `norm`ed heading names in text order, at most 12. */
  headings: string[];
  /** Names of open dialog and alertdialog nodes; an unnamed one shows its role. */
  dialogs: string[];
  /** Alert and status nodes: their name plus their StaticText. */
  alerts: string[];
  /** The body's innerText, `norm`ed per line, blank lines dropped, typed field text cut out. */
  text: string;
  /**
   * `text` is a placeholder: a text typed into an editable region, too short to cut out (one or two characters),
   * shows in the body text as a word, so none of it is sent.
   */
  textWithheld: boolean;
}
