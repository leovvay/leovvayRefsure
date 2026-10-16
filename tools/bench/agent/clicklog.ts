import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';

/*
  The fixture server's click log (6.1): `<ISO ts> {"run":"<id>","page":..,"button":..[,"row":..][,"event":..]}` per
  line in `<results>/<phase>/clicks.log`. The harness records the byte offset before and after each run and reads
  the run's slice 500 ms after the agent exits. A line of the slice with another run id, or a line of this run
  outside its offsets, is a harness defect: the run is void and re-run under a new id.
*/

export interface ClickLine { ts: string; run?: string; page?: string; button?: string; event?: string; [field: string]: unknown }
export interface ClickSlice { start: number; end: number; lines: ClickLine[]; defect: string | null }

function readRange(path: string, start: number, end: number): string {
  if (end <= start) return '';
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(end - start);
    let read = 0;
    while (read < buffer.length) {
      const n = readSync(fd, buffer, read, buffer.length - read, start + read);
      if (n === 0) break;
      read += n;
    }
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export function parseClickLines(text: string): ClickLine[] {
  const lines: ClickLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const space = line.indexOf(' ');
    const json = space > 0 ? line.slice(space + 1) : line;
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      lines.push({ ...parsed, ts: space > 0 ? line.slice(0, space) : '' });
    } catch {
      lines.push({ ts: '', event: 'unparsed' });
    }
  }
  return lines;
}

/** The run's slice between two offsets, with the 6.1 defect check over the whole file. */
export function readSlice(path: string, runId: string, start: number, end: number): ClickSlice {
  if (!existsSync(path)) return { start, end, lines: [], defect: null };
  const size = statSync(path).size;
  const lines = parseClickLines(readRange(path, start, end));
  let defect: string | null = null;
  const foreign = lines.filter((line) => line.run !== runId);
  if (foreign.length > 0) defect = `${foreign.length} line(s) in the run's offsets carry another run id`;
  const marker = `"run":"${runId}"`;
  const outside = readRange(path, 0, start).includes(marker) || readRange(path, end, size).includes(marker);
  if (outside) defect = `${defect === null ? '' : `${defect}; `}a line of this run lies outside its offsets`;
  return { start, end, lines, defect };
}

/**
 * POST /__run on the fixture server (loopback only) with the control token the server wrote to `<clicks>.ctl`, sent
 * as `x-bench-control`. Sets the run id (every later log line carries it) or, with '', clears it. Returns the log's
 * byte offset the server answered at that moment: every earlier line is on disk, so two answers bracket a run.
 */
export async function setServerRun(fixtureBase: string, clicksPath: string, runId: string): Promise<number> {
  const token = readFileSync(`${clicksPath}.ctl`, 'utf8').trim();
  const res = await fetch(`${fixtureBase}/__run`, {
    method: 'POST', body: runId, headers: { 'x-bench-control': token, 'content-type': 'text/plain' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`fixture server /__run answered ${res.status}`);
  const body = (await res.json()) as { run: string | null; offset: number };
  if (body.run !== (runId === '' ? null : runId) || typeof body.offset !== 'number') throw new Error('fixture server did not take the run id');
  return body.offset;
}
