import { execFile } from 'node:child_process';
import type { KeySource } from './key-source';

const TIMEOUT_MS = 5000;
const MAX_OUTPUT = 64 * 1024;

/**
 * Runs `argv` with no shell and a 5 s budget, and takes trimmed stdout as the key. Any failure, an empty
 * answer or a multi-line one is `null`; the output is never echoed, not even into an error.
 */
export function commandKey(argv: readonly string[]): KeySource {
  const [file, ...args] = argv;
  return {
    kind: 'command',
    label: file ?? '',
    read: () => new Promise<string | null>((resolve) => {
      if (!file) {
        resolve(null);
        return;
      }
      try {
        execFile(file, args, {
          timeout: TIMEOUT_MS, shell: false, maxBuffer: MAX_OUTPUT, windowsHide: true, encoding: 'utf8',
        }, (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          const value = stdout.trim();
          resolve(value && !/[\r\n]/.test(value) ? value : null);
        });
      } catch {
        resolve(null);
      }
    }),
  };
}
