import { findAgentBrowserBinary } from './ab-binary';
import type { HeadlessRerun } from './headless-rerun-result';
import { defaultSession, openCommand, URL_PLACEHOLDER } from './resolve-session';

/** A URL longer than this is left out of the command (`<url>` instead): the detail stays short. */
const URL_SHOWN_MAX = 300;
const WEB_URL = /^https?:\/\/\S+$/i;

/**
 * The way on from a hidden Orca tab: the agent opens the same URL in its own headless agent-browser session (the
 * default one for this terminal, with the binary refsure would drive) and reruns the verb there. Nothing is shown or
 * focused, so the human's screen never moves. refsure itself still never opens or navigates anything.
 */
export function headlessRerun(env: NodeJS.ProcessEnv, url: string, verb: string): HeadlessRerun {
  const bin = findAgentBrowserBinary(env);
  const session = defaultSession(env);
  const shown = WEB_URL.test(url) && url.length <= URL_SHOWN_MAX ? url : URL_PLACEHOLDER;
  const argv = bin === null ? null : openCommand(bin, session, shown);
  const open = argv === null ? `agent-browser --session ${session} open ${shown}` : argv.join(' ');
  const text = `Rerun on your own headless session: ${open}, then REFSURE_BACKEND=agent-browser refsure ${verb} `
    + `<same flags> --page ${session}`;
  return { text, next: argv === null ? null : { do: 'open_session', argv } };
}
