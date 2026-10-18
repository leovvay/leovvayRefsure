import { parseSnapshot, readAttr, readConsole, readCount, readNetwork, readText } from '../agent-browser-format';
import { BrowserError, isBrowserError } from '../browser-error';
import type { BrowserErrorCode } from '../browser-error-code';
import type { BrowserPort } from '../browser-port';
import { checkedAttr, checkedRef, LOG_LIMIT } from '../checked-args';
import type { PageRef } from '../page-ref';
import { READ_TIMEOUT_MS, stripRefsureEnv } from '../run-json';
import { actOnOrca, dismissOrcaDialog, fillInputOnOrca, pressEnterOnOrca } from './orca-act';
import { findOrcaBinary } from './orca-binary';
import type { OrcaBrowserOptions } from './orca-browser-options';
import { orcaError } from './orca-error-map';
import { ORCA_FEATURES } from './orca-features';
import { probeOrca } from './orca-probe';
import { readTab } from './orca-replies';
import type { OrcaRun } from './orca-run';
import { settleOnOrca } from './orca-settle';
import { createOrcaRun, describeOrcaTransport } from './orca-transport';
import { resolveOrcaPage } from './resolve-page';
import { pageArgs } from './worktree-guard';

const UNREACHED: ReadonlySet<BrowserErrorCode> = new Set<BrowserErrorCode>(['no_tab', 'orca_not_running', 'not_in_orca_terminal']);
// A selector for `exec`, sent as one double-quoted token: no double quote, backslash or control character in it.
const EXEC_SELECTOR = /^[^"\\\u0000-\u001f\u007f]{1,2000}$/;

/**
 * The Orca backend: every call goes over Orca's runtime socket as the typed `orca` CLI would send it, or spawns that
 * CLI with `--json` when the socket cannot take it (see orca-transport); nothing else in refsure reaches Orca.
 */
export function createOrcaBrowser(opts: OrcaBrowserOptions): BrowserPort {
  const { env, trace } = opts;
  const bin = findOrcaBinary(env);
  const childEnv = stripRefsureEnv(env);
  const run: OrcaRun = createOrcaRun(bin, env, childEnv);

  async function call(args: readonly string[]): Promise<unknown> {
    const reply = await run(args, READ_TIMEOUT_MS);
    if (!reply.ok) throw orcaError(reply.code, reply.message);
    return reply.result;
  }

  function onPage(page: PageRef, verb: readonly string[], ...flags: string[]): string[] {
    return [...verb, ...flags, ...pageArgs(page, env)];
  }

  return {
    backend: 'orca',
    probe: () => probeOrca(bin, env, run, () => describeOrcaTransport(env)),
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
      return readText(await call(onPage(page, ['get'], '--what=text', `--element=${element}`)), 'orca get text');
    },

    async attr(page, ref, name) {
      const attrName = checkedAttr(name);
      const command = `get attr @${checkedRef(ref)} ${attrName}`;
      return readAttr(await call(onPage(page, ['exec'], `--command=${command}`)), 'orca exec get attr');
    },

    async count(page, css) {
      if (css.trim() === '') throw new BrowserError('backend_error', 'count needs a CSS selector');
      return readCount(await call(onPage(page, ['get'], '--what=count', `--element=${css}`)), 'orca get count', css);
    },

    async selectorText(page, css) {
      if (css.trim() === '') throw new BrowserError('backend_error', 'selectorText needs a CSS selector');
      return readText(await call(onPage(page, ['get'], '--what=text', `--element=${css}`)), 'orca get text');
    },

    async selectorAttr(page, css, name) {
      const attrName = checkedAttr(name);
      if (!EXEC_SELECTOR.test(css)) throw new BrowserError('backend_error', 'selectorAttr takes no double quote or backslash');
      const result = await call(onPage(page, ['exec'], `--command=get attr "${css}" ${attrName}`));
      return readAttr(result, 'orca exec get attr');
    },

    act: (page, ref, action, value, bind) => actOnOrca({ env, trace, run }, page, ref, action, value, bind),

    fillInput: (page, ref, value) => fillInputOnOrca({ env, trace, run }, page, ref, value),

    pressEnter: (page, ref) => pressEnterOnOrca({ env, trace, run }, page, ref),

    settle: (page, capMs, anim) => settleOnOrca({ env, trace, run }, page, capMs, anim),

    async scrollDown(page, px) {
      await call(onPage(page, ['scroll'], '--direction=down', `--amount=${Math.max(1, Math.round(px))}`));
    },

    async highlight(page, ref) {
      await call(onPage(page, ['highlight'], `--selector=@${checkedRef(ref)}`));
    },

    // The whole recent log: `triage --since` filters it by the mark's time itself.
    async console(page) {
      return readConsole(await call(onPage(page, ['console'], `--limit=${LOG_LIMIT}`)), 'orca console');
    },

    async network(page) {
      return readNetwork(await call(onPage(page, ['network'], `--limit=${LOG_LIMIT}`)), 'orca network');
    },

    dialogDismiss: (page) => dismissOrcaDialog({ env, trace, run }, page),
  };
}
