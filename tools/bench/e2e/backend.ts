import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findAgentBrowserBinary } from '../../../src/browser/agent-browser/ab-binary';
import { openTab } from '../../calibrate/lib/orca-tab';
import { worktreeSelectorOf } from '../../calibrate/lib/worktree';
import type { Backend } from './scenario';

/*
  One run's page (protocol 6.2). Orca: one tab in the named isolated profile (`tab profile list` must say scope
  `isolated`, and `tab profile show` must echo the profile id for the new tab, or the phase aborts), closed after
  the run; any failure to open that page aborts the phase. agent-browser: `--session rb-<run> open <url>`, then
  `--session rb-<run> close`; the session starts its headless browser on a fresh, empty profile directory under
  `--ab-profiles` (the ledger names it; it is deleted after the close). Both calls pass refsure's own guards: an
  empty `--config` (no user or cwd config can name a CDP target, auto-connect or headed) and no `*_proxy` env.
*/

export class PhaseAbort extends Error {}

export interface RunPage {
  /** What refsure takes as `--page`: the Orca page id or the agent-browser session name. */
  id: string;
  profile: string | null;
  profile_dir: string | null;
  close(): Promise<void>;
}

function run(bin: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, [...args], { env, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (error, _out, stderr) => {
      if (error) reject(new Error(`${args.slice(4).join(' ')}: ${String(stderr).trim().slice(0, 300) || error.message}`));
      else resolve();
    });
  });
}

const PROXY = /^(http|https|all|no)_proxy$/i;

function withoutAgentBrowserEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !name.startsWith('AGENT_BROWSER_') && !name.startsWith('REFSURE_') && !PROXY.test(name)));
}

async function openOrca(url: string, profile: string): Promise<RunPage> {
  const tab = await openTab(process.env, { url, profile, worktree: worktreeSelectorOf(process.env) });
  if (tab.profile !== profile) {
    await tab.close();
    throw new PhaseAbort(`orca tab ${tab.pageId}: tab profile show did not return ${profile}`);
  }
  return { id: tab.pageId, profile: tab.profile, profile_dir: null, close: () => tab.close() };
}

export async function openPage(backend: Backend, url: string, runId: string, opts: { profile?: string; abProfiles?: string }): Promise<RunPage> {
  if (backend === 'orca') {
    if (!opts.profile) throw new PhaseAbort('--profile (the isolated Orca profile id) is required for the orca backend');
    try {
      return await openOrca(url, opts.profile);
    } catch (error) {
      throw error instanceof PhaseAbort ? error : new PhaseAbort(`orca page open: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const env = withoutAgentBrowserEnv();
  const bin = findAgentBrowserBinary(env);
  if (bin === null) throw new PhaseAbort('no agent-browser binary on PATH');
  if (!opts.abProfiles) throw new PhaseAbort('--ab-profiles (a directory outside both repos) is required for agent-browser');
  const session = `rb-${runId}`;
  const dir = join(opts.abProfiles, session);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const config = join(opts.abProfiles, 'empty-config.json');
  writeFileSync(config, '{}\n', { mode: 0o600 });
  const drop = (): void => rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  const close = (): Promise<void> => run(bin, ['--config', config, '--session', session, 'close'], env).catch(() => undefined).then(drop);
  try {
    await run(bin, ['--config', config, '--session', session, '--profile', dir, 'open', url], env);
  } catch (error) {
    await close();
    throw error;
  }
  return { id: session, profile: null, profile_dir: dir, close };
}
