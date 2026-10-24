import { performance } from 'node:perf_hooks';
import type { ActResult } from '../act-result';
import type { BrowserPort } from '../browser-port';
import type { PageRef } from '../page-ref';
import type { TrailAct, TrailOpen, TrailRecorder, TrailSend } from '../trail-recorder';

type Trailed = Pick<BrowserPort, 'snapshot' | 'act' | 'fillInput' | 'pressEnter' | 'scrollDown'>;

const DONE: ActResult = { kind: 'done' };

/** Where a trailed act records and draws, and the abort check it runs after the draw, before the act. */
interface TrailHooks { recorder: TrailRecorder; send: TrailSend; recheck: () => void }

/** A trail call that throws is as if it was never made. */
function quietly<T>(fallback: T, call: () => T): T {
  try {
    return call();
  } catch {
    return fallback;
  }
}

/**
 * One act with its trail around it: the row opens as `pending`, the draw with the arm for the act's input is sent and
 * awaited (`send` never throws and gives up after its own 300 ms), then the act runs exactly as it would without the
 * trail, and its answer closes the row. The act's own result and error pass through unchanged; any fault in the
 * trail's code is swallowed. The draw goes before the act's first wire call (its paint probe), so Orca's tab queue
 * runs it first and the arm is listening when the act's input lands. A run aborted during the draw sends nothing:
 * `recheck` throws, and the row closes with no answer.
 */
async function trailed<T>(
  on: TrailHooks, page: PageRef, act: TrailAct, inner: () => Promise<T>, answer: (value: T) => ActResult,
): Promise<T> {
  const { recorder, send, recheck } = on;
  const open: TrailOpen | null = quietly(null, () => recorder.begin(page, act));
  if (open !== null) {
    const call = quietly(null, () => recorder.draw(page, open));
    try {
      if (call !== null) await send(page, call);
    } catch {
      // The act goes on as it would without the trail.
    }
  }
  try {
    recheck();
  } catch (error) {
    if (open !== null) quietly(undefined, () => recorder.end(open, null, 0));
    throw error;
  }
  const started = performance.now();
  let value: T;
  try {
    value = await inner();
  } catch (error) {
    if (open !== null) quietly(undefined, () => recorder.end(open, null, performance.now() - started));
    throw error;
  }
  if (open !== null) quietly(undefined, () => recorder.end(open, answer(value), performance.now() - started));
  return value;
}

/**
 * The Orca adapter's methods that feed the trail, wrapped (spec trail v1): `snapshot` reports its time, node count,
 * origin and tree (the role and name an act's ref is drawn with, never a value), and the four page-changing calls
 * (`act`, `fillInput`, `pressEnter`, `scrollDown`) draw before they run. These sit below the registry's guard, so a
 * read verb, a dry run or an aborted run never reaches them. `dialogDismiss` is never wrapped: nothing is drawn while
 * a dialog may be open, since a dialog holds every eval in the tab's queue.
 */
export function withTrail<P extends Trailed>(
  port: P, recorder: TrailRecorder, send: TrailSend, recheck: () => void,
): P {
  const { snapshot, act, fillInput, pressEnter, scrollDown } = port;
  const on: TrailHooks = { recorder, send, recheck };
  const wrapped: P = {
    ...port,
    async snapshot(page) {
      const started = performance.now();
      const tree = await snapshot.call(port, page);
      quietly(undefined, () => recorder.read(page, performance.now() - started, tree));
      return tree;
    },
    act: (page, ref, action, value, bind) => trailed(
      on, page, { action, ref }, () => act.call(port, page, ref, action, value, bind), (sent) => sent,
    ),
  };
  if (fillInput) {
    wrapped.fillInput = (page, ref, value) => trailed(
      on, page, { action: 'fill', ref }, () => fillInput.call(port, page, ref, value), (sent) => sent,
    );
  }
  if (pressEnter) {
    wrapped.pressEnter = (page, ref) => trailed(
      on, page, { action: 'enter', ref }, () => pressEnter.call(port, page, ref), (sent) => sent,
    );
  }
  if (scrollDown) {
    wrapped.scrollDown = (page, px) => trailed(
      on, page, { action: 'scroll', ref: null }, () => scrollDown.call(port, page, px), () => DONE,
    );
  }
  return wrapped;
}
