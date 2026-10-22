import { join } from 'node:path';
import { executableName, firstExecutable, pathCandidates } from '../../shared';

const MAC_APP_ORCA = '/Applications/Orca.app/Contents/Resources/bin/orca';
export const NO_ORCA_BINARY = 'no orca binary in $ORCA_CLI_BIN_DIR, on PATH, or in the Orca app';

/** Where the Orca app keeps its CLI: the macOS bundle, or the Windows per-user install. */
function appOrca(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== 'win32') return [MAC_APP_ORCA];
  return env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Programs', 'orca', 'resources', 'bin', 'orca.exe')] : [];
}

/** Spec §11 lookup order: `$ORCA_CLI_BIN_DIR/orca`, then `orca` on PATH, then the app's own copy. */
export function findOrcaBinary(env: NodeJS.ProcessEnv): string | null {
  const own = env.ORCA_CLI_BIN_DIR ? [join(env.ORCA_CLI_BIN_DIR, executableName('orca'))] : [];
  return firstExecutable([...own, ...pathCandidates(env, 'orca'), ...appOrca(env)]);
}
