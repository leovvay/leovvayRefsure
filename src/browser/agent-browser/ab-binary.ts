import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Where the macOS Orca app keeps its resources, the bundled agent-browser among them. */
export const ORCA_RESOURCES = '/Applications/Orca.app/Contents/Resources';

/** The name Orca gives the agent-browser it bundles for this machine, e.g. `agent-browser-darwin-arm64`. */
function bundledName(): string {
  return `agent-browser-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
}

/**
 * `agent-browser` on PATH first; then the one Orca bundles, searched for under its resources (the top level, where
 * Orca 1.4 keeps it, then the unpacked app archive's package). Null when there is none.
 */
export function findAgentBrowserBinary(env: NodeJS.ProcessEnv): string | null {
  const candidates: string[] = [];
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, 'agent-browser'));
  }
  const name = bundledName();
  candidates.push(
    join(ORCA_RESOURCES, name),
    join(ORCA_RESOURCES, 'app.asar.unpacked', 'node_modules', 'agent-browser', 'bin', name),
  );
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
