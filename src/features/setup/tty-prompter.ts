/** The human's own terminal, opened apart from stdin and stdout (which belong to the agent and the envelope). */
export interface TtyPrompter {
  write(text: string): void;
  /** Writes the prompt, then the next typed line; `null` at end of input or once the run is interrupted. */
  ask(prompt: string): Promise<string | null>;
  close(): void;
}
