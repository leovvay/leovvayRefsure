import type { BrowserErrorCode } from './browser-error-code';

/** Which CLI a call ran, for messages, and the code a failed start maps to. */
export interface JsonChild {
  label: 'orca' | 'agent-browser';
  spawnCode: BrowserErrorCode;
}

export interface SpawnJsonOptions {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  /** The verb words for messages: never a value. */
  verb: string;
  /** Called once the process exists: from here on a page action may have reached the browser. */
  onSpawn?: () => void;
  /** Written to stdin and stdin closed; stdin is left alone without it. */
  input?: string;
  /** The call sent a value (a fill may carry a password): its raw output, which may echo it, never reaches a detail. */
  withholdOutput: boolean;
}
