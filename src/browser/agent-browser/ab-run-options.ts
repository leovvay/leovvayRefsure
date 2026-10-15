export interface AbRunOptions {
  /** The child's environment, already stripped by `stripChildEnv`. */
  env: NodeJS.ProcessEnv;
  /** refsure's own empty agent-browser config file, passed as `--config` so no other config file is read. */
  config: string;
  timeoutMs: number;
  /** Called once the process exists: from here on a page action may have reached the browser. */
  onSpawn?: () => void;
  /** Written to the child's stdin (a batch's commands); stdin is closed empty otherwise. */
  input?: string;
}
