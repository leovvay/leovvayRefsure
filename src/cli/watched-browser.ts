import type { BrowserPort, TabInfo } from '../browser';

/** The port a command receives, plus the last `TabInfo` it read, which the envelope's `page` is built from. */
export interface WatchedBrowser { port: BrowserPort; lastTab(): TabInfo | null }
