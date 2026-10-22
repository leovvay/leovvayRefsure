import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** The file a command runs from: `orca.exe` on Windows, where `orca.cmd` beside it cannot be spawned without a shell. */
export function executableName(name: string): string {
  return process.platform === 'win32' && !/\.exe$/i.test(name) ? `${name}.exe` : name;
}

/** Every directory on PATH, in order. */
export function pathDirs(env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? '').split(delimiter).filter((dir) => dir !== '');
}

/** `<dir>/<name>` for every directory on PATH, in order. */
export function pathCandidates(env: NodeJS.ProcessEnv, name: string): string[] {
  const file = executableName(name);
  return pathDirs(env).map((dir) => join(dir, file));
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
