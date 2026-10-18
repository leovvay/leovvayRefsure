import type { ActBinding } from '../act-binding';
import type { ActResult } from '../act-result';
import type { Ref } from '../ax-tree';
import { boundDetail } from '../bound-detail';
import type { PageRef } from '../page-ref';
import { ACT_TIMEOUT_MS, READ_TIMEOUT_MS } from '../run-json';
import { lostDetail, sendOnce } from '../send-once';
import { isRecord } from '../../shared';
import { orcaError, refusedBeforeDispatch, staleRefReply } from './orca-error-map';
import type { OrcaBrowserOptions } from './orca-browser-options';
import type { OrcaRun } from './orca-run';
import { chooseOrcaTransport } from './runtime-lookup';
import { pageArgs } from './worktree-guard';

type ClickDeps = OrcaBrowserOptions & { run: OrcaRun };

/** Why the native click gave way to agent-browser's, before anything was sent; for `REFSURE_RUN_TIMING`. */
type Fallback = 'socket' | 'box' | 'outside' | 'frame' | 'cover' | 'name';

/** Roles of a control: one between the element at the point and the target means another control takes the click. */
const CONTROL_ROLES: readonly string[] = [
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
  'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem', 'listbox',
];
/** One edge of the box the element must have at the point: agent-browser's `get box` and the page agree to 1 px. */
const EDGE_PX = 1;
/** How far up from the element at the point the check looks for the one with the box (parents, shadow hosts). */
const UP_MAX = 12;
const TEXT_MAX = 300;

/**
 * The hit check, read only: in the page, the box's centre must be in the viewport; the element there (down through
 * open shadow roots) must not be a frame; and it, or an ancestor within `UP_MAX`, must have exactly the box, or be
 * the `<label>` of a control with exactly the box (a custom radio: the click lands on its label, which activates it,
 * as agent-browser's own check counts a label and its control as one). No control may sit between the element at the
 * point and the one with the box: a container the target fills has the target's box too, and a sibling control drawn
 * over the target inside it (Ryanair's return-date button, mid-animation over the departure one) would take the
 * click (`cover`). That element's tag, role, `aria-label`, the names its `aria-labelledby` points to (each one's
 * `aria-label`, else its text) and its `innerText` (the label's for a control under its label; collapsed, cut) come
 * back. Only the box's four numbers are put into the expression, each a finite number.
 */
function hitCheck(box: Box): string {
  return `(() => {
  const b = ${JSON.stringify(box)}, cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  if (!(cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight)) return JSON.stringify({ why: 'outside' });
  let at = document.elementFromPoint(cx, cy);
  while (at && at.shadowRoot) {
    const inner = at.shadowRoot.elementFromPoint(cx, cy);
    if (!inner || inner === at) break;
    at = inner;
  }
  if (!at) return JSON.stringify({ why: 'box' });
  if (at.tagName === 'IFRAME' || at.tagName === 'FRAME') return JSON.stringify({ why: 'frame' });
  const same = (r) => Math.abs(r.left - b.x) <= ${EDGE_PX} && Math.abs(r.top - b.y) <= ${EDGE_PX}
    && Math.abs(r.right - (b.x + b.width)) <= ${EDGE_PX} && Math.abs(r.bottom - (b.y + b.height)) <= ${EDGE_PX};
  const roles = ${JSON.stringify(CONTROL_ROLES)};
  const control = (e) => (e.tagName === 'A' && e.hasAttribute('href'))
    || ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION'].includes(e.tagName)
    || roles.includes(String(e.getAttribute('role') || '').trim().toLowerCase())
    || (e.hasAttribute('tabindex') && e.tabIndex >= 0);
  let n = at;
  for (let up = 0; n && up <= ${UP_MAX}; up += 1) {
    const labelled = n.tagName === 'LABEL' && n.control && same(n.control.getBoundingClientRect()) ? n : null;
    if (labelled) n = labelled.control;
    if (n.nodeType === 1 && !same(n.getBoundingClientRect()) && control(n)) return JSON.stringify({ why: 'cover' });
    if (n.nodeType === 1 && same(n.getBoundingClientRect())) {
      const text = String((labelled || n).innerText || '').replace(/\\s+/g, ' ').trim().slice(0, ${TEXT_MAX});
      const by = String(n.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map((id) => {
        const el = document.getElementById(id);
        return el ? (el.getAttribute('aria-label') || el.textContent || '') : '';
      }).join(' ').replace(/\\s+/g, ' ').trim().slice(0, ${TEXT_MAX});
      return JSON.stringify({ x: cx, y: cy, tag: n.tagName, role: n.getAttribute('role'), label: n.getAttribute('aria-label'), by, text });
    }
    n = n.parentElement || (n.parentNode && n.parentNode.host) || null;
  }
  return JSON.stringify({ why: 'box' });
})()`;
}

interface Box { x: number; y: number; width: number; height: number }

/** A box from `get box`: four finite numbers, the size above zero; null otherwise. */
function boxOf(result: unknown): Box | null {
  if (!isRecord(result)) return null;
  const { x, y, width, height } = result;
  const all = [x, y, width, height];
  if (!all.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const box = { x: x as number, y: y as number, width: width as number, height: height as number };
  return box.width > 0 && box.height > 0 ? box : null;
}

/** The point to click, when the hit check found the element with the box and it carries the bound name. */
function pointOf(result: unknown, bind: ActBinding): { x: number; y: number } | Fallback {
  const raw = isRecord(result) && typeof result.result === 'string' ? result.result : null;
  let hit: unknown;
  try {
    hit = raw === null ? null : JSON.parse(raw);
  } catch {
    return 'box';
  }
  if (!isRecord(hit)) return 'box';
  if (hit.why === 'outside' || hit.why === 'frame' || hit.why === 'cover') return hit.why;
  const { x, y, label, by, text } = hit;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'box';
  const carries = [label, by, text].some((said) => typeof said === 'string' && bind.carries(said));
  return carries ? { x, y } : 'name';
}

/**
 * A click through Orca's own mouse (design 2026-10-17 round 3 §7): press and release at the element's centre, with
 * no move first. agent-browser's click moves the mouse first, and Chromium answers a move only on its next frame,
 * which in a tab Orca does not show comes about once a second; press and release need no frame (7-11 ms, not
 * 0.5-1 s). The guard has already rechecked the element on a fresh snapshot; this binds the point to it:
 *
 * 1. `get box` of the ref, a read. A gone ref is `stale_ref`, nothing sent.
 * 2. The hit check, a read (`hitCheck`): the point is in view, lands on the element with that very box, and that
 *    element's own label, labelled-by names or text carries the name the guard read (`bind`).
 * 3. `mouse click` once (`sendOnce`): the one send. A failure after it is `unknown`, never retried.
 *
 * Every doubt before the send (no socket, a box or answer it cannot read, a point outside the view, a frame, a cover,
 * another name) returns the reason, and the caller clicks through agent-browser, which refuses a covered point itself.
 */
export async function nativeClick(
  deps: ClickDeps, page: PageRef, ref: Ref, bind: ActBinding,
): Promise<ActResult | Fallback> {
  if (chooseOrcaTransport(deps.env).kind !== 'socket') return 'socket';
  const at = pageArgs(page, deps.env);
  const boxed = await deps.run(['exec', `--command=get box @${ref}`, ...at], READ_TIMEOUT_MS);
  if (!boxed.ok) return staleRefReply(boxed.code, boxed.message) ? { kind: 'stale_ref' } : 'box';
  const box = boxOf(boxed.result);
  if (box === null) return 'box';
  const checked = await deps.run(['eval', `--expression=${hitCheck(box)}`, ...at], READ_TIMEOUT_MS);
  if (!checked.ok) return 'box';
  const point = pointOf(checked.result, bind);
  if (typeof point === 'string') return point;
  let written = false;
  const args = ['mouse', 'click', `--x=${point.x}`, `--y=${point.y}`, '--button=left', ...at];
  const sent = await sendOnce(deps.trace, (onSpawn) => deps.run(args, ACT_TIMEOUT_MS, () => {
    written = true;
    onSpawn();
  }));
  if (sent.kind === 'lost') return { kind: 'unknown', detail: lostDetail(sent.error, 'orca', undefined) };
  // Refused before the write (the socket went away since the transport check): nothing was sent.
  if (!written) {
    deps.trace.dispatched = sent.before;
    return 'socket';
  }
  const reply = sent.reply;
  if (reply.ok) return { kind: 'done' };
  if (refusedBeforeDispatch(reply.code, reply.message)) {
    deps.trace.dispatched = sent.before;
    throw orcaError(reply.code, reply.message);
  }
  return { kind: 'unknown', detail: boundDetail(`orca mouse click: ${reply.code}: ${reply.message}`) };
}
