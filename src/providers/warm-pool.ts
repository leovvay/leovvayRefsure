import { isIP } from 'node:net';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import type { WarmUp } from './warm-up';

/*
  The warm-up behind `preconnect`: a TLS connection to the provider's host, opened once the route is approved and
  handed to the first Decision's request, with nothing sent on it before. Every request to that origin goes through
  one pool of fetch's own dispatcher class (`poolFor`): its `connect` hook gives the pool that socket first, and opens
  a plain one after, so later requests reuse the same connection as they would with fetch's global pool.

  Not with a proxy or another dispatcher in front of fetch: they decide where a request goes, and a socket opened here
  would go around them. `https:` only.
*/

/** A connection opened at approval that no request takes within this is closed. */
const WARM_IDLE_MS = 10_000;
/** How long a later connection of a warm pool may take to open (fetch's own default). */
const CONNECT_MS = 10_000;
/** Where Node's fetch keeps its dispatcher: undici's key, shared by every copy of undici in a process. */
const GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.1');

type Dispatcher = NonNullable<RequestInit['dispatcher']>;
type Connected = (error: Error | null, socket: TLSSocket | null) => void;
/** undici's `connect` option: called each time the pool needs a connection. */
type Connector = (opts: { hostname: string; port: string }, done: Connected) => void;
type AgentClass = new (opts: { connect: Connector }) => Dispatcher;

/** One try per origin per process: the pool that holds its warm connection, or `null` when there is none. */
const pools = new Map<string, Dispatcher | null>();
/** This process's warm-ups, in the order they started. */
const warmed: WarmUp[] = [];

/**
 * Opens the TLS connection to `url`'s origin and, once `loadFetch` has loaded fetch's code (~10 ms, run while the
 * handshake is under way), builds the pool that hands it over. A connection no request takes within `WARM_IDLE_MS`
 * is closed. It never throws.
 */
export function warmUp(url: string, loadFetch: () => void): void {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return;
  }
  const { origin } = target;
  if (target.protocol !== 'https:' || pools.has(origin)) return;
  pools.set(origin, null);
  const warm: WarmUp = { startedAt: performance.now(), readyAt: null, takenAt: null, failed: null };
  warmed.push(warm);
  // A dispatcher already set (a proxy from the environment, or one set before refsure ran) stops it before anything
  // is opened.
  const set = dispatcherNow();
  if (set !== undefined && agentClassOf(set) === null) {
    warm.failed = 'another dispatcher';
    return;
  }
  const host = unbracketed(target.hostname);
  let spare: TLSSocket | null = openTls(host, Number(target.port || 443));
  let idle: NodeJS.Timeout | undefined;
  const gone = (why: string): void => {
    if (spare === null) return;
    spare.destroy();
    spare = null;
    clearTimeout(idle);
    warm.failed = why;
  };
  const failed = (error: Error): void => gone(codeOf(error));
  const closed = (): void => gone('closed');
  // Held open only by the request that takes it: a run that ends first exits at once.
  spare.unref();
  spare.once('secureConnect', () => {
    warm.readyAt = performance.now();
  });
  spare.on('error', failed).once('close', closed);
  idle = setTimeout(() => gone('unused'), WARM_IDLE_MS).unref();
  setImmediate(() => {
    if (dispatcherNow() === undefined) loadFetch();
    const current = dispatcherNow();
    const Agent = current === undefined ? null : agentClassOf(current);
    if (Agent === null) {
      gone('another dispatcher');
      return;
    }
    pools.set(origin, new Agent({
      connect(opts, done) {
        const socket = spare;
        const asked = unbracketed(opts.hostname);
        spare = null;
        if (socket === null || socket.destroyed || asked !== host) {
          connectFresh(asked, Number(opts.port || 443), done);
          return;
        }
        clearTimeout(idle);
        socket.off('error', failed).off('close', closed).ref();
        warm.takenAt = performance.now();
        whenSecure(socket, warm.readyAt !== null, done);
      },
    }));
  });
}

/** The warm pool for `url`'s origin, as a fetch option, when `warmUp` built one. */
export function poolFor(url: string): { dispatcher?: Dispatcher } {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return {};
  }
  const pool = pools.get(origin);
  return pool ? { dispatcher: pool } : {};
}

/** This process's warm-ups, in the order they started, for `REFSURE_RUN_TIMING`. */
export function warmUps(): readonly WarmUp[] {
  return warmed.map((warm) => ({ ...warm }));
}

function dispatcherNow(): object | undefined {
  const current = (globalThis as Record<symbol, unknown>)[GLOBAL_DISPATCHER];
  return typeof current === 'object' && current !== null ? current : undefined;
}

/** The class of fetch's own stock dispatcher; `null` for anything else (a proxy agent, a mock). */
function agentClassOf(dispatcher: object): AgentClass | null {
  const { constructor } = dispatcher;
  return typeof constructor === 'function' && constructor.name === 'Agent' ? constructor as AgentClass : null;
}

/** An IPv6 literal without its URL brackets. */
function unbracketed(host: string): string {
  return host.replace(/^\[|\]$/g, '');
}

/** A TLS connection as fetch's own: HTTP/1.1 only, no Nagle delay, TCP keep-alive. */
function openTls(host: string, port: number): TLSSocket {
  const socket = connectTls({
    host,
    port,
    // SNI names a host, never an address.
    ...(isIP(host) === 0 ? { servername: host } : {}),
    ALPNProtocols: ['http/1.1'],
  });
  return socket.setNoDelay(true).setKeepAlive(true, 60_000);
}

/** A later connection of a warm pool (the warm one was taken or closed), bounded like fetch's own. */
function connectFresh(host: string, port: number, done: Connected): void {
  const socket = openTls(host, port);
  socket.setTimeout(CONNECT_MS, () => socket.destroy(new Error(`no connection within ${CONNECT_MS} ms`)));
  whenSecure(socket, false, (error, ready) => {
    socket.setTimeout(0);
    done(error, ready);
  });
}

/** Hands `socket` over once TLS is up (the certificate checked), or its error; nothing is written to it before. */
function whenSecure(socket: TLSSocket, ready: boolean, done: Connected): void {
  if (ready) {
    done(null, socket);
    return;
  }
  const up = (): void => {
    socket.off('error', failed);
    done(null, socket);
  };
  const failed = (error: Error): void => {
    socket.off('secureConnect', up);
    socket.destroy();
    done(error, null);
  };
  socket.once('secureConnect', up).once('error', failed);
}

function codeOf(error: Error): string {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && code !== '' ? code : 'error';
}
