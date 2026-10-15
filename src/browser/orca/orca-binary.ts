import { join } from 'node:path';
import { firstExecutable, pathCandidates } from '../find-binary';

const MAC_APP_ORCA = '/Applications/Orca.app/Contents/Resources/bin/orca';
export const NO_ORCA_BINARY = 'no orca binary in $ORCA_CLI_BIN_DIR, on PATH, or in /Applications/Orca.app';

/** Spec §11 lookup order: `$ORCA_CLI_BIN_DIR/orca`, then `orca` on PATH, then the macOS app bundle. */
export function findOrcaBinary(env: NodeJS.ProcessEnv): string | null {
  const own = env.ORCA_CLI_BIN_DIR ? [join(env.ORCA_CLI_BIN_DIR, 'orca')] : [];
  return firstExecutable([...own, ...pathCandidates(env, 'orca'), MAC_APP_ORCA]);
}
