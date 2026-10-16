import { newTicketId } from '../../../src/tickets';
import type { RunWhen, Step } from './scenario';

/*
  A scenario step's argv: written as one line with double quotes (`locate --intent "the Save button" --risk write`),
  split here into words with no shell involved. `{Tn}` is step n's `result.ticket`; `{NAME}` is a ref a snap step
  took (`refs`). A placeholder with no value leaves the step unrunnable (the harness never guesses one).
*/

/** Splits on spaces outside double quotes; `\"` and `\\` escape inside quotes. An unclosed quote throws. */
export function splitArgv(line: string): string[] {
  const out: string[] = [];
  let word = '';
  let inWord = false;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '\\' && (line[i + 1] === '"' || line[i + 1] === '\\')) {
        word += line[i + 1];
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        word += ch;
      }
    } else if (ch === '"') {
      quoted = true;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) out.push(word);
      word = '';
      inWord = false;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (quoted) throw new Error(`unclosed quote in: ${line}`);
  if (inWord) out.push(word);
  return out;
}

/** What earlier steps left behind: per step n, its status, exit code and ticket; refs by name. */
export interface StepState { ran: boolean; status: string | null; exit: number | null; ticket: string | null }
export type Done = ReadonlyMap<number, StepState>;

/** Whether a step's `run` condition holds given the earlier steps. */
export function shouldRun(when: RunWhen, done: Done): boolean {
  if (when === 'always') return true;
  if ('ticket' in when) return done.get(when.ticket)?.ticket != null;
  if ('ok' in when) return when.ok.every((n) => done.get(n)?.status === 'ok');
  const [n, codes] = when.exit;
  const step = done.get(n);
  return step?.ran === true && step.exit !== null && codes.includes(step.exit);
}

/**
 * The step's words with every placeholder filled, or the first placeholder that has no value. `dry` fills a ticket
 * placeholder with a well-formed, unknown ticket id so `--dry-run` parsing can be checked without a real ticket.
 */
export function fillArgv(step: Step, done: Done, refs: ReadonlyMap<string, string>, dry = false): { argv: string[] } | { missing: string } {
  const words = splitArgv(step.argv);
  const out: string[] = [];
  for (const word of words) {
    let missing: string | null = null;
    const filled = word.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
      const ticketOf = /^T(\d+)$/.exec(name);
      if (ticketOf) {
        const ticket = done.get(Number(ticketOf[1]))?.ticket ?? (dry ? newTicketId() : null);
        if (ticket === null) missing ??= whole;
        return ticket ?? whole;
      }
      const ref = refs.get(name);
      if (ref === undefined) missing ??= whole;
      return ref ?? whole;
    });
    if (missing !== null) return { missing };
    out.push(filled);
  }
  return { argv: out };
}
