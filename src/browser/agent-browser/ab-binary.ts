import { closeSync, openSync, readSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { firstExecutable, pathCandidates } from '../find-binary';

/** Where the macOS Orca app keeps its resources, the bundled agent-browser among them. */
const ORCA_RESOURCES = '/Applications/Orca.app/Contents/Resources';

/**
 * The name agent-browser gives its native build for this machine, e.g. `agent-browser-darwin-arm64`: the file Orca
 * bundles, and the one an npm or Homebrew install keeps beside its node wrapper.
 */
function nativeName(): string {
  return `agent-browser-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
}

/** Whether a file starts with `#!`: a script (the node wrapper), not a native build. Unreadable reads as native. */
function isScript(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(file, 'r');
    const head = Buffer.alloc(2);
    return readSync(fd, head, 0, 2, 0) === 2 && head.toString('latin1') === '#!';
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * A node wrapper (Homebrew's `agent-browser` is one) only spawns the native build kept beside its real file, at about
 * 50 ms of node start per call; that build is the same version, so its daemon is the same one. Anything else as is.
 */
function nativeOf(file: string): string {
  if (!isScript(file)) return file;
  try {
    return firstExecutable([join(dirname(realpathSync(file)), nativeName())]) ?? file;
  } catch {
    return file;
  }
}

/**
 * `agent-browser` on PATH first (a node wrapper read as the native build beside it); then the one Orca bundles,
 * searched for under its resources (the top level, where Orca 1.4 keeps it, then the unpacked app archive's
 * package). An absolute path, so an agent can run the very binary refsure drives; null when there is none.
 */
export function findAgentBrowserBinary(env: NodeJS.ProcessEnv): string | null {
  const name = nativeName();
  const found = firstExecutable([
    ...pathCandidates(env, 'agent-browser'),
    join(ORCA_RESOURCES, name),
    join(ORCA_RESOURCES, 'app.asar.unpacked', 'node_modules', 'agent-browser', 'bin', name),
  ]);
  return found === null ? null : nativeOf(resolve(found));
}
