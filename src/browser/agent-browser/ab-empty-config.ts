import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserError } from '../browser-error';

const EMPTY = '{}\n';
const FILE = 'agent-browser-empty-config.json';

/**
 * The path of refsure's own empty agent-browser config, written 0600 under refsure's state directory when missing
 * or changed. Every child gets `--config <it>`, so agent-browser reads neither `~/.agent-browser/config.json` nor
 * `./agent-browser.json` from refsure's working directory. Either can name a profile, headed, a CDP target or
 * auto-connect, and agent-browser sends those with every command: a value that differs from the session's makes its
 * daemon relaunch the browser with it (probed live: a cwd file naming a profile relaunched a live session there).
 * Throws `backend_error` when the file cannot be written, before anything is spawned.
 */
export function emptyConfigFile(stateDir: string): string {
  const path = join(stateDir, FILE);
  try {
    if (readFileSync(path, 'utf8') === EMPTY) return path;
  } catch {
    // Missing or unreadable: written below.
  }
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeFileSync(temp, EMPTY, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
    return path;
  } catch (error) {
    rmSync(temp, { force: true });
    const code = (error as NodeJS.ErrnoException).code ?? 'an error';
    throw new BrowserError(
      'backend_error',
      `refsure could not write its empty agent-browser config at ${path} (${code}); nothing was sent`,
    );
  }
}
