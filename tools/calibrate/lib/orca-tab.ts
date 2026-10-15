import { execFile } from 'node:child_process';
import { findOrcaBinary } from '../../../src/browser/orca';
import type { OrcaTab } from './orca-tab-shape';

/*
  The replay's one tab: created in the isolated Orca profile the caller names (never the default profile, which
  carries a person's cookies), moved from page to page with `goto`, closed at the end. refsure itself never
  navigates; only the harness does, between items. Snapshots go through refsure's own adapter, not this file.
*/

const TIMEOUT_MS = 30_000;

function orcaJson(bin: string, args: readonly string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    execFile(bin, [...args, '--json'], { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      let reply: { ok?: boolean; result?: Record<string, unknown>; error?: { code?: string; message?: string } };
      try {
        reply = JSON.parse(stdout) as typeof reply;
      } catch {
        reject(new Error(`orca ${args[0]} ${args[1] ?? ''}: ${error?.message ?? 'no JSON reply'}`));
        return;
      }
      if (reply.ok !== true) {
        reject(new Error(`orca ${args[0]}: ${reply.error?.code ?? 'error'} ${reply.error?.message ?? ''}`.trim()));
        return;
      }
      resolve(reply.result ?? {});
    });
  });
}

/** Opens one tab at `url` in `profile` for `worktree` (the `id:…` selector refsure itself passes). */
export async function openTab(env: NodeJS.ProcessEnv, opts: { url: string; profile: string; worktree: string }): Promise<OrcaTab> {
  if (opts.profile.trim() === '') throw new Error('an isolated Orca profile id is required (--profile)');
  const bin = findOrcaBinary(env);
  if (bin === null) throw new Error('no orca binary: set ORCA_CLI_BIN_DIR or put orca on PATH');
  const where = ['--worktree', opts.worktree];
  const created = await orcaJson(bin, ['tab', 'create', '--url', opts.url, ...where, '--profile', opts.profile]);
  if (typeof created.browserPageId !== 'string') throw new Error('orca tab create gave no browserPageId');
  const pageId: string = created.browserPageId;
  const shown = await orcaJson(bin, ['tab', 'profile', 'show', '--page', pageId, ...where]).catch(() => ({}));
  return {
    pageId,
    profile: JSON.stringify(shown).includes(opts.profile) ? opts.profile : null,
    async goto(url) {
      const result = await orcaJson(bin, ['goto', '--url', url, '--page', pageId, ...where]);
      return typeof result.url === 'string' ? result.url : url;
    },
    async close() {
      await orcaJson(bin, ['tab', 'close', '--page', pageId, ...where]).catch(() => undefined);
    },
  };
}
