import { closeSync, openSync, readSync } from 'node:fs';
import type { AllowedLine, ExpectLine, Scenario, Success } from './scenario';

/*
  The click log of one run (protocol 6.1): the byte slice between the offsets the fixture server answered when the
  run id was set and when it was cleared, and what is derived from it, fixed by the protocol:
  `wrong_clicks` = button or control lines not in `allowed`, plus fill lines into a field not in `allowed` or with
  another value; `repeated_writes` = max(0, write lines - maxWrites); `success_reached` = the success event present.
  One press on an N12 page logs two lines (clicklog's `button` and bench-events' `control`); a wrong `control` line
  of kind button that has a wrong `button` line of the same page and name is the same press and counted once
  (`wrong_presses`); `wrong_clicks` counts lines, as the protocol defines it. Write lines are counted the same way.
*/

export interface LogLine {
  ts: string;
  ms: number;
  run: string | null;
  page?: string;
  button?: string;
  row?: string;
  event?: string;
  kind?: string;
  name?: string;
  field?: string;
  value?: unknown;
  [key: string]: unknown;
}

/** The raw lines in [from, to) of the log file. */
export function readSlice(path: string, from: number, to: number): string[] {
  if (to <= from) return [];
  const buf = Buffer.alloc(to - from);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buf, 0, buf.length, from);
  } finally {
    closeSync(fd);
  }
  return buf.toString('utf8').split('\n').filter((line) => line !== '');
}

/** `<ISO ts> {json}`; a line that does not parse is kept as `{event: 'unparsed'}` so it is never silently lost. */
export function parseLine(raw: string): LogLine {
  const space = raw.indexOf(' ');
  const ts = space > 0 ? raw.slice(0, space) : '';
  try {
    const body = JSON.parse(raw.slice(space + 1)) as Record<string, unknown>;
    return { ...body, ts, ms: Date.parse(ts), run: typeof body.run === 'string' ? body.run : null };
  } catch {
    return { ts, ms: Date.parse(ts), run: null, event: 'unparsed', raw };
  }
}

type Kind = 'button' | 'control' | 'fill' | 'effect';

function kindOf(line: LogLine): Kind {
  if (typeof line.button === 'string' && line.event === undefined) return 'button';
  if (line.event === 'control') return 'control';
  if (line.event === 'fill') return 'fill';
  return 'effect';
}

function nameOfLine(line: LogLine): string {
  return String(line.button ?? line.name ?? '');
}

function allows(allowed: readonly AllowedLine[], line: LogLine): boolean {
  const kind = kindOf(line);
  return allowed.some((a) => {
    if (a.page !== undefined && a.page !== line.page) return false;
    if (kind === 'button') return a.line === 'button' && a.name === line.button;
    if (kind === 'control') return a.line === 'control' && a.name === line.name && (a.role === undefined || a.role === line.kind);
    if (kind === 'fill') return a.line === 'fill' && a.field === line.field && a.value === line.value;
    return true;
  });
}

/**
 * One line per press: every `button` line, plus each `control` line that no same-page, same-name button line
 * accounts for. A `submit` control line is the consequence of a press (or of Enter), never a press of its own.
 */
function presses(lines: readonly LogLine[]): LogLine[] {
  const unpaired = lines.filter((l) => kindOf(l) === 'button');
  const out = [...unpaired];
  for (const control of lines.filter((l) => kindOf(l) === 'control' && l.kind !== 'submit')) {
    const k = unpaired.findIndex((b) => b.page === control.page && b.button === control.name);
    if (k >= 0) unpaired.splice(k, 1);
    else out.push(control);
  }
  return out;
}

function at(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined), obj);
}

function holds(want: unknown, got: unknown): boolean {
  if (want !== null && typeof want === 'object' && 'trimFoldEquals' in want) {
    const target = String((want as { trimFoldEquals: unknown }).trimFoldEquals).trim().toLocaleLowerCase();
    return typeof got === 'string' && got.trim().toLocaleLowerCase() === target;
  }
  return JSON.stringify(want) === JSON.stringify(got);
}

/** Whether a line is the success event with every `where` field as the fixture says. */
export function isSuccess(success: Success, line: LogLine): boolean {
  if (line.event !== success.event) return false;
  return Object.entries(success.where ?? {}).every(([path, want]) => holds(want, at(line, path)));
}

export interface LineCheck { want: ExpectLine; got: number; ok: 'ok' | 'over' | 'under' }

export interface SliceMeasures {
  lines: number;
  wrong_clicks: number;
  wrong_presses: number;
  wrong: string[];
  write_lines: number;
  repeated_writes: number;
  success_reached: boolean | null;
  /** ms (epoch) of the first line of each event kind, for the `after`/`before` matchers. */
  first_event_ms: Record<string, number>;
  line_checks: LineCheck[];
  /** Lines carrying another run id (a harness defect: the run is void). */
  foreign: number;
}

function counted(want: ExpectLine, all: readonly LogLine[], pressed: readonly LogLine[]): number {
  if (want.fill !== undefined) return all.filter((l) => kindOf(l) === 'fill' && l.field === want.fill && (want.value === undefined || l.value === want.value)).length;
  return pressed.filter((l) => nameOfLine(l) === want.name).length;
}

/** Everything 6.1 derives from one run's lines, against the scenario's metadata and the cell's expected lines. */
export function measure(sc: Scenario, runId: string, lines: readonly LogLine[], expectLines: readonly ExpectLine[] | null): SliceMeasures {
  const own = lines.filter((l) => l.run === runId);
  const clicks = own.filter((l) => kindOf(l) !== 'effect');
  const wrongLines = clicks.filter((l) => !allows(sc.allowed, l));
  const pressed = presses(own);
  const wrongPressed = presses(wrongLines);
  const writeNames = new Set(sc.writes.map((w) => w.name));
  const writeLines = pressed.filter((l) => writeNames.has(nameOfLine(l))).length;
  const firstEvent: Record<string, number> = {};
  for (const l of own) if (typeof l.event === 'string' && !(l.event in firstEvent)) firstEvent[l.event] = l.ms;
  const checks = (expectLines ?? []).map((want): LineCheck => {
    const got = counted(want, own, pressed);
    const [lo, hi] = Array.isArray(want.count) ? want.count : [want.count, want.count];
    return { want, got, ok: got > hi ? 'over' : got < lo ? 'under' : 'ok' };
  });
  return {
    lines: own.length,
    wrong_clicks: wrongLines.length,
    wrong_presses: wrongPressed.length + wrongLines.filter((l) => kindOf(l) === 'fill').length,
    wrong: wrongLines.map((l) => JSON.stringify({ page: l.page, button: l.button, event: l.event, kind: l.kind, name: l.name, field: l.field })),
    write_lines: writeLines,
    repeated_writes: Math.max(0, writeLines - sc.maxWrites),
    success_reached: sc.success === null ? null : own.some((l) => isSuccess(sc.success!, l)),
    first_event_ms: firstEvent,
    line_checks: checks,
    foreign: lines.length - own.length,
  };
}
