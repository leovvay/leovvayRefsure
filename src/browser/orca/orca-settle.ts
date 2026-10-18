import { BrowserError } from '../browser-error';
import type { PageRef } from '../page-ref';
import type { Settled } from '../settled';
import { isRecord } from '../../shared';
import { orcaError } from './orca-error-map';
import type { OrcaBrowserOptions } from './orca-browser-options';
import type { OrcaRun } from './orca-run';
import { chooseOrcaTransport } from './runtime-lookup';
import { pageArgs } from './worktree-guard';

type SettleDeps = OrcaBrowserOptions & { run: OrcaRun };

/** The call's own deadline beyond the in-page cap. */
const MARGIN_MS = 1_000;

/**
 * The wait, in the page: frame by frame until one frame has come and, with `anim`, no finite CSS or Web animation
 * runs (an infinite spinner does not count), or until `cap` ms. It reads a frame count and an animation count, never
 * page text, and changes nothing. The in-page timer is load-bearing: Orca awaits the promise in the tab's command
 * queue with no deadline of its own, so a promise waiting on a frame that never comes would hold every later call on
 * the tab. Only `cap` and `anim` are put into it, as literals.
 */
function settleScript(cap: number, anim: boolean): string {
  return `new Promise((done) => {
  const cap = ${cap}, anim = ${anim}, t0 = performance.now();
  let frames = 0, last = 0, over = false;
  const running = () => document.getAnimations().filter((a) => a.playState === 'running'
    && a.effect !== null && a.effect.getTiming().iterations !== Infinity).length;
  const end = (quiet) => { if (!over) { over = true;
    done(JSON.stringify({ frames, quiet, ms: Math.round(performance.now() - t0), last: Math.round(last) })); } };
  setTimeout(() => end(false), cap);
  const tick = () => { if (over) return; frames += 1; last = performance.now() - t0;
    if (!anim || running() === 0) end(true); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})`;
}

/**
 * `settle` on Orca: one `eval` of `settleScript` over the runtime socket. On the CLI transport it is `unsupported`
 * (an `orca eval` process costs about 100 ms, more than the wait saves), and the caller waits a fixed time instead.
 */
export async function settleOnOrca(deps: SettleDeps, page: PageRef, capMs: number, anim: boolean): Promise<Settled> {
  if (chooseOrcaTransport(deps.env).kind !== 'socket') {
    throw new BrowserError('unsupported', 'a settle needs the Orca runtime socket');
  }
  const cap = Math.max(1, Math.round(capMs));
  const reply = await deps.run(['eval', `--expression=${settleScript(cap, anim)}`, ...pageArgs(page, deps.env)], cap + MARGIN_MS);
  if (!reply.ok) throw orcaError(reply.code, reply.message);
  const raw = isRecord(reply.result) && typeof reply.result.result === 'string' ? reply.result.result : '';
  let seen: unknown;
  try {
    seen = JSON.parse(raw);
  } catch {
    seen = null;
  }
  if (!isRecord(seen) || typeof seen.frames !== 'number' || typeof seen.quiet !== 'boolean' || typeof seen.ms !== 'number') {
    throw new BrowserError('backend_error', 'orca eval: the settle answered in an unknown shape');
  }
  // An answer without `last` reads as a frame at the start: the oldest it can be.
  const last = typeof seen.last === 'number' ? seen.last : 0;
  return { frames: seen.frames, quiet: seen.quiet, ms: seen.ms, last };
}
