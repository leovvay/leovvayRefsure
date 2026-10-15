import { isRef, parseSnapshot } from '../agent-browser-format';
import type { Ref } from '../ax-tree';
import { BrowserError, isBrowserError } from '../browser-error';
import type { BrowserErrorCode } from '../browser-error-code';
import type { BrowserPort } from '../browser-port';
import type { PageRef } from '../page-ref';
import { actOnOrca, dismissOrcaDialog } from './orca-act';
import { findOrcaBinary } from './orca-binary';
import type { OrcaBrowserOptions } from './orca-browser-options';
import { orcaError } from './orca-error-map';
import { ORCA_FEATURES } from './orca-features';
import { probeOrca } from './orca-probe';
import { readAttr, readConsole, readCount, readNetwork, readTab, readText } from './orca-replies';
import type { OrcaRun } from './orca-run';
import { READ_TIMEOUT_MS, runOrca, stripRefsureEnv } from './orca-runner';
import { resolveOrcaPage } from './resolve-page';
import { pageArgs } from './worktree-guard';

const LOG_LIMIT = 200;
const UNREACHED: ReadonlySet<BrowserErrorCode> = new Set<BrowserErrorCode>(['no_tab', 'orca_not_running', 'not_in_orca_terminal']);
// `exec` hands its command to agent-browser's own tokenizer, so only plain attribute names may pass.
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;

/** The Orca backend: every call spawns the typed `orca` CLI with `--json`; nothing else in refsure spawns it. */
export function createOrcaBrowser(opts: OrcaBrowserOptions): BrowserPort {
  const { env, trace } = opts;
  const bin = findOrcaBinary(env);
  const childEnv = stripRefsureEnv(env);
  const run: OrcaRun = (args, timeoutMs, onSpawn) => runOrca(bin, args, { env: childEnv, timeoutMs, onSpawn });

  async function call(args: readonly string[], onSpawn?: () => void): Promise<unknown> {
    const reply = await run(args, READ_TIMEOUT_MS, onSpawn);
    if (!reply.ok) throw orcaError(reply.code, reply.message);
    return reply.result;
  }

  function onPage(page: PageRef, verb: readonly string[], ...flags: string[]): string[] {
    return [...verb, ...flags, ...pageArgs(page, env)];
  }

  return {
    backend: 'orca',
    probe: () => probeOrca(bin, env, run),
    features: () => ORCA_FEATURES,
    resolvePage: (hint) => resolveOrcaPage(hint, env, (worktree) => call(['tab', 'current', `--worktree=${worktree}`])),

    async tabInfo(page) {
      return readTab(await call(onPage(page, ['tab', 'show'])), page.id);
    },

    async snapshot(page) {
      const args = onPage(page, ['snapshot']);
      let result: unknown;
      try {
        result = await call(args);
      } catch (error) {
        // Once the page has the call, Orca may renumber refs whether or not a tree comes back. A missing tab or
        // app never got it, so no ref can have moved.
        if (!isBrowserError(error) || !UNREACHED.has(error.code)) trace.snapshotTaken = true;
        throw error;
      }
      trace.snapshotTaken = true;
      return parseSnapshot(result, page.id);
    },

    async text(page, target) {
      const element = target === 'body' ? 'body' : checkedRef(target);
      return readText(await call(onPage(page, ['get'], '--what=text', `--element=${element}`)), 'get text');
    },

    async attr(page, ref, name) {
      if (!ATTR_NAME.test(name)) throw new BrowserError('backend_error', `not a plain attribute name: ${name}`);
      const command = `get attr @${checkedRef(ref)} ${name}`;
      return readAttr(await call(onPage(page, ['exec'], `--command=${command}`)));
    },

    async count(page, css) {
      if (css.trim() === '') throw new BrowserError('backend_error', 'count needs a CSS selector');
      return readCount(await call(onPage(page, ['get'], '--what=count', `--element=${css}`)), css);
    },

    async selectorText(page, css) {
      if (css.trim() === '') throw new BrowserError('backend_error', 'selectorText needs a CSS selector');
      return readText(await call(onPage(page, ['get'], '--what=text', `--element=${css}`)), 'get text');
    },

    act: (page, ref, action, value) => actOnOrca({ env, trace, run }, page, ref, action, value),

    async highlight(page, ref) {
      await call(onPage(page, ['highlight'], `--selector=@${checkedRef(ref)}`));
    },

    // A mark is resolved by the caller; Orca keeps no cursor, so `since` is not sent.
    async console(page) {
      return readConsole(await call(onPage(page, ['console'], `--limit=${LOG_LIMIT}`)));
    },

    async network(page) {
      return readNetwork(await call(onPage(page, ['network'], `--limit=${LOG_LIMIT}`)));
    },

    dialogDismiss: (page) => dismissOrcaDialog({ env, trace, run }, page),
  };
}

function checkedRef(ref: Ref): Ref {
  if (!isRef(ref)) throw new BrowserError('stale_ref', `not a snapshot ref: ${String(ref).slice(0, 40)}`);
  return ref;
}
