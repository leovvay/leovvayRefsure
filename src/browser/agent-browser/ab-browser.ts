import {
  asResult, isRef, parseSnapshot, readAttr, readConsole, readCount, readNetwork, readText, str,
} from '../agent-browser-format';
import type { Ref } from '../ax-tree';
import { BrowserError } from '../browser-error';
import type { BrowserPort } from '../browser-port';
import type { BrowserCapability } from '../capability';
import type { PageRef } from '../page-ref';
import { actOnSession, dismissSessionDialog } from './ab-act';
import { findAgentBrowserBinary } from './ab-binary';
import type { AgentBrowserOptions } from './ab-browser-options';
import { abError } from './ab-error-map';
import { featuresFromHelp } from './ab-features';
import { probeAgentBrowser } from './ab-probe';
import type { AbRun } from './ab-run';
import { helpTextSync, READ_TIMEOUT_MS, runAgentBrowser, runAgentBrowserText, stripChildEnv } from './ab-runner';
import { readSessions } from './ab-sessions';
import { checkedSession, notOpen, resolveSession } from './resolve-session';

const LOG_LIMIT = 200;
// agent-browser takes its arguments as argv words, so only a word it could read as a flag is refused.
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;
const SELECTOR = /^[^-\s][\s\S]{0,1999}$/;

/**
 * The standalone backend: a session the user opened with `agent-browser --session <name> open <url>`, driven
 * through its typed verbs with `--json`. The page id is the session name; refsure acts on its active tab. Nothing
 * here launches a browser: every page call first checks that the session is open.
 */
export function createAgentBrowser(opts: AgentBrowserOptions): BrowserPort {
  const { env, trace } = opts;
  const bin = findAgentBrowserBinary(env);
  const childEnv = stripChildEnv(env);
  const run: AbRun = (args, timeoutMs, onSpawn) => runAgentBrowser(bin, args, { env: childEnv, timeoutMs, onSpawn });
  let features: ReadonlySet<BrowserCapability> | null = null;
  const featureSet = (): ReadonlySet<BrowserCapability> => {
    features ??= featuresFromHelp(bin ? helpTextSync(bin, childEnv) : null);
    return features;
  };
  const checks = new Map<string, Promise<boolean>>();

  // Any call on a session agent-browser does not list would launch a new browser for it.
  function isOpen(session: string): Promise<boolean> {
    let check = checks.get(session);
    if (!check) {
      check = run(['session', 'list'], READ_TIMEOUT_MS).then((reply) => {
        if (!reply.ok) throw abError(reply.message);
        return readSessions(reply.result).includes(session);
      });
      checks.set(session, check);
    }
    return check;
  }

  async function on(page: PageRef): Promise<string[]> {
    const session = checkedSession(page.id);
    if (!(await isOpen(session))) throw notOpen(session);
    return ['--session', session];
  }

  async function call(page: PageRef, verb: readonly string[], onSpawn?: () => void): Promise<unknown> {
    const reply = await run([...await on(page), ...verb], READ_TIMEOUT_MS, onSpawn);
    if (!reply.ok) throw abError(reply.message);
    return reply.result;
  }

  return {
    backend: 'agent-browser',
    probe: () => probeAgentBrowser({
      bin, run, features: featureSet, version: () => runAgentBrowserText(bin!, ['--version'], childEnv),
    }),
    features: featureSet,
    resolvePage: (hint) => resolveSession(hint, env, isOpen),

    async tabInfo(page) {
      const [url, title] = await Promise.all([call(page, ['get', 'url']), call(page, ['get', 'title'])]);
      return {
        id: page.id,
        url: str(asResult(url, 'agent-browser get url').url) ?? '',
        title: str(asResult(title, 'agent-browser get title').title) ?? '',
        // agent-browser reports no load error, certificate failure or profile for a session.
        loadError: null,
        certificateFailure: null,
        profileId: null,
        profileLabel: null,
      };
    },

    async snapshot(page) {
      // Once the call reaches agent-browser it may renumber refs, whether or not a tree comes back.
      const result = await call(page, ['snapshot'], () => {
        trace.snapshotTaken = true;
      });
      return parseSnapshot(result, page.id);
    },

    async text(page, target) {
      const element = target === 'body' ? 'body' : `@${checkedRef(target)}`;
      return readText(await call(page, ['get', 'text', element]), 'agent-browser get text');
    },

    async attr(page, ref, name) {
      const result = await call(page, ['get', 'attr', `@${checkedRef(ref)}`, checkedAttr(name)]);
      return readAttr(result, 'agent-browser get attr');
    },

    async count(page, css) {
      return readCount(await call(page, ['get', 'count', checkedSelector(css)]), 'agent-browser get count', css);
    },

    async selectorText(page, css) {
      return readText(await call(page, ['get', 'text', checkedSelector(css)]), 'agent-browser get text');
    },

    async selectorAttr(page, css, name) {
      const result = await call(page, ['get', 'attr', checkedSelector(css), checkedAttr(name)]);
      return readAttr(result, 'agent-browser get attr');
    },

    act: async (page, ref, action, value) => actOnSession({ run, trace }, await on(page), ref, action, value),

    async highlight(page, ref) {
      await call(page, ['highlight', `@${checkedRef(ref)}`]);
    },

    // A mark is resolved by the caller; agent-browser keeps no cursor refsure could use, so `since` is not sent.
    async console(page) {
      return readConsole(await call(page, ['console']), 'agent-browser console').slice(-LOG_LIMIT);
    },

    async network(page) {
      return readNetwork(await call(page, ['network', 'requests']), 'agent-browser network requests').slice(-LOG_LIMIT);
    },

    dialogDismiss: async (page) => dismissSessionDialog({ run, trace }, await on(page)),
  };
}

function checkedRef(ref: Ref): Ref {
  if (!isRef(ref)) throw new BrowserError('stale_ref', `not a snapshot ref: ${String(ref).slice(0, 40)}`);
  return ref;
}

function checkedAttr(name: string): string {
  if (!ATTR_NAME.test(name)) throw new BrowserError('backend_error', `not a plain attribute name: ${name}`);
  return name;
}

function checkedSelector(css: string): string {
  if (!SELECTOR.test(css)) {
    throw new BrowserError('backend_error', 'a selector must be non-empty and must not start with "-" or a space');
  }
  return css;
}
