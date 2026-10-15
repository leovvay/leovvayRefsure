import { join } from 'node:path';
import { firstExecutable, pathCandidates } from '../find-binary';

/** Where the macOS Orca app keeps its resources, the bundled agent-browser among them. */
const ORCA_RESOURCES = '/Applications/Orca.app/Contents/Resources';

/** The name Orca gives the agent-browser it bundles for this machine, e.g. `agent-browser-darwin-arm64`. */
function bundledName(): string {
  return `agent-browser-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
}

/**
 * `agent-browser` on PATH first; then the one Orca bundles, searched for under its resources (the top level, where
 * Orca 1.4 keeps it, then the unpacked app archive's package). Null when there is none.
 */
export function findAgentBrowserBinary(env: NodeJS.ProcessEnv): string | null {
  const name = bundledName();
  return firstExecutable([
    ...pathCandidates(env, 'agent-browser'),
    join(ORCA_RESOURCES, name),
    join(ORCA_RESOURCES, 'app.asar.unpacked', 'node_modules', 'agent-browser', 'bin', name),
  ]);
}
