/** How one runtime call is bounded and reported: its whole budget, the verb for messages, and the written hook. */
export interface RuntimeCallOptions {
  timeoutMs: number;
  /** The verb words for messages: never a value. */
  verb: string;
  /** Called once the request is written to the socket: from here on a page action may have reached the browser. */
  onWritten?: () => void;
}
