import type { OrcaReply } from './orca-reply';
import type { RpcRequest } from './rpc-request';

type Flags = ReadonlyMap<string, string>;

/** An `invalid_argument` the CLI prints before it reaches the runtime; the message is the CLI's own. */
class CliRefusal extends Error {}

/**
 * One verb of the adapter's argv, as the CLI handler builds it (`out/cli/handlers/browser-*.js`). `target` is how
 * the handler finds the tab: `page` through `getBrowserCommandTarget`, `worktree` through `getBrowserWorktreeSelector`.
 */
interface Route {
  method: string;
  flags: readonly string[];
  target: 'page' | 'worktree';
  params?: (flags: Flags) => Record<string, unknown>;
}

const element = (flags: Flags) => ({ element: required(flags, 'element') });
const valued = (flags: Flags) => ({ element: required(flags, 'element'), value: required(flags, 'value') });
const checked = (to: boolean) => (flags: Flags) => ({ ...element(flags), checked: to });
const limited = (flags: Flags) => {
  const limit = positiveInteger(flags, 'limit');
  return limit === undefined ? {} : { limit };
};
const onPage = (method: string, flags: readonly string[] = [], params?: Route['params']): Route => ({
  method, flags, target: 'page', params,
});

const ROUTES: Readonly<Record<string, Route>> = {
  'tab show': onPage('browser.tabShow'),
  'tab current': { method: 'browser.tabCurrent', flags: [], target: 'worktree' },
  snapshot: onPage('browser.snapshot'),
  get: onPage('browser.get', ['what', 'element'], (flags) => ({
    what: required(flags, 'what'), selector: optional(flags, 'element'),
  })),
  exec: onPage('browser.exec', ['command'], (flags) => ({ command: required(flags, 'command') })),
  click: onPage('browser.click', ['element'], element),
  dblclick: onPage('browser.dblclick', ['element'], element),
  fill: onPage('browser.fill', ['element', 'value'], valued),
  select: onPage('browser.select', ['element', 'value'], valued),
  check: onPage('browser.check', ['element'], checked(true)),
  uncheck: onPage('browser.check', ['element'], checked(false)),
  highlight: onPage('browser.highlight', ['selector'], (flags) => ({ selector: required(flags, 'selector') })),
  console: onPage('browser.console', ['limit'], limited),
  network: onPage('browser.network', ['limit'], limited),
  'dialog dismiss': onPage('browser.dialogDismiss'),
};

/**
 * The runtime call the `orca` CLI would make for `args`, or the refusal it would print before making one. Null
 * when the CLI must run it: `status`, a verb or flag this map does not know, or a target the CLI resolves from its
 * own working directory (no `--page`, `--worktree=active`, a `path:` selector). Only the `--flag=value` form is read,
 * the one the adapter builds.
 */
export function rpcFor(args: readonly string[]): RpcRequest | OrcaReply | null {
  const words: string[] = [];
  const flags = new Map<string, string>();
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      words.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq === -1 || flags.has(arg.slice(2, eq))) return null;
    flags.set(arg.slice(2, eq), arg.slice(eq + 1));
  }
  const verb = words.join(' ');
  const route = Object.hasOwn(ROUTES, verb) ? ROUTES[verb] : undefined;
  const known = (name: string) => route?.flags.includes(name) || name === 'page' || name === 'worktree';
  if (!route || ![...flags.keys()].every(known)) return null;
  const target = route.target === 'page' ? pageTarget(flags) : worktreeTarget(flags);
  if (target === null) return null;
  try {
    return { method: route.method, params: { ...route.params?.(flags), ...target } };
  } catch (error) {
    if (!(error instanceof CliRefusal)) throw error;
    return { ok: false, code: 'invalid_argument', message: error.message };
  }
}

// `getBrowserCommandTarget`: a page id is global, and an explicit worktree only checks it. `all` drops the check.
function pageTarget(flags: Flags): Record<string, unknown> | null {
  const page = optional(flags, 'page');
  if (page === undefined || worktreeCwd(flags)) return null;
  const worktree = optional(flags, 'worktree');
  return worktree === undefined || worktree === 'all' ? { page } : { page, worktree };
}

// `getBrowserWorktreeSelector`: with no `--worktree` the CLI would look the worktree up from its cwd.
function worktreeTarget(flags: Flags): Record<string, unknown> | null {
  const worktree = optional(flags, 'worktree');
  if (worktree === undefined || worktreeCwd(flags)) return null;
  return worktree === 'all' ? {} : { worktree };
}

/** A selector the CLI rewrites against its cwd or the worktree list before sending it. */
function worktreeCwd(flags: Flags): boolean {
  const worktree = flags.get('worktree') ?? '';
  return worktree === 'active' || worktree === 'current' || worktree.startsWith('path:');
}

function required(flags: Flags, name: string): string {
  const value = flags.get(name);
  if (!value) throw new CliRefusal(`Missing required --${name}`);
  return value;
}

function optional(flags: Flags, name: string): string | undefined {
  return flags.get(name) || undefined;
}

function positiveInteger(flags: Flags, name: string): number | undefined {
  const text = optional(flags, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new CliRefusal(`Invalid numeric value for --${name}`);
  if (!Number.isInteger(value) || value <= 0) throw new CliRefusal(`Invalid positive integer for --${name}`);
  return value;
}
