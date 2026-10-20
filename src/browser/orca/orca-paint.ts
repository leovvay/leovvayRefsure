import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PageRef } from '../page-ref';
import { isRecord } from '../../shared';
import type { OrcaBrowserOptions } from './orca-browser-options';
import type { OrcaRun } from './orca-run';
import { pageArgs } from './worktree-guard';

type PaintDeps = Pick<OrcaBrowserOptions, 'env'> & { run: OrcaRun; painted: Set<string> };

/** The document's paint entries and when it began, as one string: `<count> <timeOrigin>`. */
const PROBE = "performance.getEntriesByType('paint').length+' '+performance.timeOrigin";
/** Each call's own deadline, shorter than a read's: a hidden tab's paint took about 0.5 s, the probe far less. */
const PAINT_TIMEOUT_MS = 5_000;
// The file goes to agent-browser's tokenizer as one double-quoted token: no double quote, backslash or control
// character in it.
const QUOTABLE = /^[^"\\\u0000-\u001f\u007f]{1,1000}$/;

/**
 * Paints a page that has never painted, once per document, without showing or focusing its tab. A page loaded while
 * its Orca tab is hidden never paints, and it drops clicks, double clicks, keys and inserted text, or holds a check
 * about 5.5 s, while Orca answers `ok` (Orca 1.4.230). A screenshot paints it: Orca holds a paint for every capture,
 * and from then on the page takes input at once, though a hidden tab still draws no animation frame. The capture is
 * the smallest one (jpeg, quality 1), into a fresh temp directory removed after it.
 *
 * Best effort, and never an act: the probe and the capture go through `run` directly, not `sendOnce`, so nothing
 * counts as dispatched, it never throws, and a failed probe or capture only leaves the page as it was. `painted`
 * holds `<page id>@<timeOrigin>` for each document a capture was tried on, so the next input to it costs the probe
 * only, also after a capture that failed or timed out (Orca may still be running it in the tab's queue); a navigation
 * is a new document, with entries of its own.
 */
export async function paintOnce(deps: PaintDeps, page: PageRef): Promise<void> {
  let dir: string | null = null;
  try {
    const at = pageArgs(page, deps.env);
    const probed = await deps.run(['eval', `--expression=${PROBE}`, ...at], PAINT_TIMEOUT_MS);
    const said = probed.ok && isRecord(probed.result) ? probed.result.result : null;
    const [count, origin] = (typeof said === 'string' ? said : '').split(' ');
    if (count !== '0' || origin === undefined || origin === '') return;
    const key = `${page.id}@${origin}`;
    if (deps.painted.has(key)) return;
    dir = await mkdtemp(join(tmpdir(), 'refsure-paint-'));
    const file = join(dir, 'paint.jpg');
    if (!QUOTABLE.test(file)) return;
    const command = `screenshot "${file}" --screenshot-format jpeg --screenshot-quality 1`;
    deps.painted.add(key);
    await deps.run(['exec', `--command=${command}`, ...at], PAINT_TIMEOUT_MS);
  } catch {
    // A transport failure: the input goes on unpainted, as it would without this step.
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
