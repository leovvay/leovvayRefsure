import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { PageRef, TabInfo } from '../../../src/browser';
import { findOrcaBinary } from '../../../src/browser/orca';
import type { CaptureDeps } from '../../calibrate/lib/capture-deps';
import type { Side } from './capture-item';

/*
  One stored page opened in the capture's tab (tools/calibrate/lib/native-capture.ts `onStoredPage`, restated
  because it is private there): mount the file at its path, go there, let it settle, read, then read the tab's URL
  last; a page that left the page server's origin is `away`. Plus a selector probe through `orca eval`, so an
  authored `{selector, name}` gold is checked against the element the capture mapped by role, name and ordinal.
*/

export interface BenchDeps extends CaptureDeps {
  worktree: string;
}

export type Opened<T> = { read: T; tab: TabInfo } | { away: true };

export const pageRefOf = (deps: BenchDeps): PageRef => ({ backend: 'orca', id: deps.tab.pageId });

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function onPage<T>(deps: BenchDeps, side: Side, read: (page: PageRef) => Promise<T>, settleMs = deps.settleMs): Promise<Opened<T>> {
  const [path = '/', query] = side.at.split(/\?(.*)/s);
  const url = deps.server.mount(path, join(deps.root, side.page)) + (query === undefined || query === '' ? '' : `?${query}`);
  try {
    await deps.tab.goto(url);
    await sleep(settleMs);
    const page = pageRefOf(deps);
    const value = await read(page);
    const tab = await deps.browser.tabInfo(page);
    return originOf(tab.url) === deps.server.origin ? { read: value, tab } : { away: true };
  } finally {
    deps.server.unmount(path);
  }
}

/** The text of every element `selector` matches on the open page (accessible label first), or null when eval fails. */
export function probeSelector(deps: BenchDeps, selector: string): Promise<string[] | null> {
  const bin = findOrcaBinary(process.env);
  if (bin === null) return Promise.resolve(null);
  const js = `JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => `
    + `(e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('title') || '').trim()))`;
  const args = ['eval', '--expression', js, '--page', deps.tab.pageId, '--worktree', deps.worktree, '--json'];
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (_error, stdout) => {
      try {
        const reply = JSON.parse(stdout) as { ok?: boolean; result?: unknown };
        const r = reply.result as Record<string, unknown> | string | undefined;
        const value = typeof r === 'string' ? r : (r?.value ?? r?.result);
        const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
        resolve(reply.ok === true && Array.isArray(parsed) ? parsed.map(String) : null);
      } catch {
        resolve(null);
      }
    });
  });
}
