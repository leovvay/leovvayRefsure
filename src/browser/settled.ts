/**
 * What a settle saw (`BrowserPort.settle`): the frames the page rendered while it waited, whether it ended because
 * the page was quiet (a frame came, and with animations counted, no finite animation ran) rather than at its cap,
 * how long it took in the page, and when in it the last frame came (ms from its start; 0 with no frame).
 */
export interface Settled {
  frames: number;
  quiet: boolean;
  ms: number;
  last: number;
}
