import { execFile } from 'node:child_process';
import { firstExecutable, pathCandidates } from '../../shared';
import type { KeySource } from './key-source';

const TIMEOUT_MS = 5000;
const MAX_OUTPUT = 64 * 1024;

/**
 * The file to run. Windows looks for a bare name in the working directory before PATH, so a repo an agent works in
 * could plant `op.exe` there; on Windows a bare name is found on PATH here, as `<name>.exe`, or not at all.
 */
function resolveFile(file: string): string | null {
  if (process.platform !== 'win32' || /[\\/]/.test(file)) return file;
  return firstExecutable(pathCandidates(process.env, file));
}

/**
 * Runs `argv` with no shell and a 5 s budget, and takes trimmed stdout as the key. Any failure, an empty
 * answer or a multi-line one is `null`; the output is never echoed, not even into an error.
 */
export function commandKey(argv: readonly string[]): KeySource {
  const [named, ...args] = argv;
  return {
    kind: 'command',
    label: named ?? '',
    read: () => new Promise<string | null>((resolve) => {
      const file = named ? resolveFile(named) : null;
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
