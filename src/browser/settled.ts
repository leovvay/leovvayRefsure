/**
 * What a settle saw (`BrowserPort.settle`): the frames the page rendered while it waited, whether it ended because
 * the page was quiet (a frame came, and with animations counted, no finite animation ran) rather than at its cap,
 * and how long it took in the page.
 */
export interface Settled {
  frames: number;
  quiet: boolean;
  ms: number;
}
