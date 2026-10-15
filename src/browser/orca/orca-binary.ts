import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export const MAC_APP_ORCA = '/Applications/Orca.app/Contents/Resources/bin/orca';

/** Spec §11 lookup order: `$ORCA_CLI_BIN_DIR/orca`, then `orca` on PATH, then the macOS app bundle. */
export function findOrcaBinary(env: NodeJS.ProcessEnv): string | null {
  const candidates: string[] = [];
  if (env.ORCA_CLI_BIN_DIR) candidates.push(join(env.ORCA_CLI_BIN_DIR, 'orca'));
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, 'orca'));
  }
  candidates.push(MAC_APP_ORCA);
  return candidates.find(isExecutable) ?? null;
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
