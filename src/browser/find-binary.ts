import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** `<dir>/<name>` for every directory on PATH, in order. */
export function pathCandidates(env: NodeJS.ProcessEnv, name: string): string[] {
  return (env.PATH ?? '').split(delimiter).filter((dir) => dir !== '').map((dir) => join(dir, name));
}

/** The first candidate that is an executable file, as a shell would pick it: a directory never counts. */
export function firstExecutable(candidates: readonly string[]): string | null {
  return candidates.find(isExecutableFile) ?? null;
}

function isExecutableFile(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
