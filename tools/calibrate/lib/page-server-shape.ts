/** The replay's local page server: stored pages mounted one path at a time on 127.0.0.1. */
export interface PageServer {
  origin: string;
  /** Serves `file` at `path` and returns its URL (without a query). */
  mount(path: string, file: string): string;
  unmount(path: string): void;
  close(): Promise<void>;
}
