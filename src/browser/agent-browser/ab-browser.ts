import {
  asResult, parseSnapshot, readAttr, readConsole, readCount, readNetwork, readText, str,
} from '../agent-browser-format';
import { BrowserError } from '../browser-error';
import type { BrowserPort } from '../browser-port';
import type { BrowserCapability } from '../capability';
import { checkedAttr, checkedRef, LOG_LIMIT } from '../checked-args';
import type { PageRef } from '../page-ref';
import { READ_TIMEOUT_MS } from '../run-json';
import { actOnSession, dismissSessionDialog } from './ab-act';
import type { AbActDeps } from './ab-act-deps';
import type { AbBatchRun } from './ab-batch-run';
import { findAgentBrowserBinary } from './ab-binary';
import type { AgentBrowserOptions } from './ab-browser-options';
import { emptyConfigFile } from './ab-empty-config';
import { abError } from './ab-error-map';
import { featuresFromHelp } from './ab-features';
import { probeAgentBrowser } from './ab-probe';
import type { AbRun } from './ab-run';
import {
  helpTextSync, runAgentBrowser, runAgentBrowserBatch, runAgentBrowserText, stripChildEnv,
} from './ab-runner';
import { createSessionGuard } from './ab-session-guard';
import { activeTabId } from './ab-tabs';
import { checkedSession, resolveSession, sessionGone } from './resolve-session';

// Values travel in a batch's JSON argv, taken literally; this only keeps the word well formed.
const SELECTOR = /^\S[\s\S]{0,1999}$/;

/**
 * The standalone backend: a session the user opened with `agent-browser --session <name> open <url>`, driven
 * through its typed verbs with `--json`. The page id is the session name; refsure acts on its active tab. refsure
 * never launches a browser on purpose: every page call first checks that the session's browser is running (see
 * ab-session-guard), and an answer from a browser agent-browser started during the call is discarded.
 */
export function createAgentBrowser(opts: AgentBrowserOptions): BrowserPort {
  const { env, trace } = opts;
  const bin = findAgentBrowserBinary(env);
  const childEnv = stripChildEnv(env);
  let configFile: string | null = null;
  const config = (): string => {
    configFile ??= emptyConfigFile(opts.stateDir);
    return configFile;
  };
  const run: AbRun = async (args, timeoutMs, onSpawn) => runAgentBrowser(bin, args, {
    env: childEnv, config: config(), timeoutMs, onSpawn,
  });
  const batch: AbBatchRun = async (args, commands, timeoutMs, onSpawn) => runAgentBrowserBatch(bin, args, commands, {
    env: childEnv, config: config(), timeoutMs, onSpawn,
  });
  const guard = createSessionGuard(run, batch);
  let features: ReadonlySet<BrowserCapability> | null = null;
  const featureSet = (): ReadonlySet<BrowserCapability> => {
    features ??= featuresFromHelp(bin ? helpTextSync(bin, childEnv) : null);
    return features;
  };

  /** The verbs' results, in order, from the session's running browser; the first failure throws. */
  async function read(page: PageRef, verbs: readonly (readonly string[])[], onSpawn?: () => void): Promise<unknown[]> {
    const session = checkedSession(page.id);
    const answer = await guard.call(session, verbs, READ_TIMEOUT_MS, onSpawn);
    if (answer.launched) throw sessionGone(session, 'launched');
    return verbs.map((verb, i) => {
      const reply = answer.replies[i];
      if (!reply) throw new BrowserError('backend_error', `agent-browser batch gave no reply for ${verb[0] ?? '?'}`);
      if (!reply.ok) throw abError(reply.message);
      return reply.result;
    });
  }

  async function call(page: PageRef, verb: readonly string[], onSpawn?: () => void): Promise<unknown> {
    const [result] = await read(page, [verb], onSpawn);
    return result;
  }

  function actDeps(page: PageRef): AbActDeps {
    const session = checkedSession(page.id);
    return { session, trace, call: (verbs, timeoutMs, onSpawn) => guard.call(session, verbs, timeoutMs, onSpawn) };
  }

  return {
    backend: 'agent-browser',
    probe: () => probeAgentBrowser({
      bin, run, state: guard.state, features: featureSet,
      version: () => runAgentBrowserText(bin!, ['--version'], childEnv),
    }),
    features: featureSet,
    resolvePage: (hint) => resolveSession(hint, env, guard.state),

    async tabInfo(page) {
      const [tabs, url, title] = await read(page, [['tab', 'list'], ['get', 'url'], ['get', 'title']]);
      return {
        id: page.id,
        url: str(asResult(url, 'agent-browser get url').url) ?? '',
        title: str(asResult(title, 'agent-browser get title').title) ?? '',
        // agent-browser reports no load error, certificate failure or profile for a session.
        loadError: null,
        certificateFailure: null,
        profileId: null,
        profileLabel: null,
        tabKey: activeTabId(tabs),
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

    act: async (page, ref, action, value) => actOnSession(actDeps(page), ref, action, value),

    async highlight(page, ref) {
      await call(page, ['highlight', `@${checkedRef(ref)}`]);
    },

    // The whole recent log: `triage --since` filters it by the mark's time itself.
    async console(page) {
      return readConsole(await call(page, ['console']), 'agent-browser console').slice(-LOG_LIMIT);
    },

    async network(page) {
      return readNetwork(await call(page, ['network', 'requests']), 'agent-browser network requests').slice(-LOG_LIMIT);
    },

    dialogDismiss: async (page) => dismissSessionDialog(actDeps(page)),
  };
}

function checkedSelector(css: string): string {
  if (!SELECTOR.test(css)) {
    throw new BrowserError('backend_error', 'a selector must be non-empty and must not start with a space');
  }
  return css;
}
