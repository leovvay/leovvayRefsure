import { closeSync, openSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { ReadStream } from 'node:tty';
import type { TtyPrompter } from './tty-prompter';

/**
 * Opens `/dev/tty` read/write, or `null` when there is none (an agent's pipe, CI). Lines are read in the
 * terminal's own line mode, so its echo and editing work, and asynchronously, so an interrupt still lands.
 */
export function openTty(signal: AbortSignal): TtyPrompter | null {
  let fd: number;
  try {
    fd = openSync('/dev/tty', 'r+');
  } catch {
    return null;
  }
  let input: ReadStream;
  try {
    input = new ReadStream(fd);
  } catch {
    closeSync(fd);
    return null;
  }
  const lines = createInterface({ input, terminal: false });
  const queued: string[] = [];
  const waiting: ((line: string | null) => void)[] = [];
  let ended = false;
  lines.on('line', (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else queued.push(line);
  });
  lines.on('close', () => {
    ended = true;
    for (const waiter of waiting.splice(0)) waiter(null);
  });
  const stop = (): void => lines.close();
  signal.addEventListener('abort', stop, { once: true });
  const write = (text: string): void => {
    try {
      writeSync(fd, text);
    } catch {
      // The terminal went away; the next read ends the prompt.
    }
  };
  return {
    write,
    ask(prompt) {
      write(prompt);
      const line = queued.shift();
      if (line !== undefined) return Promise.resolve(line);
      if (ended || signal.aborted) return Promise.resolve(null);
      return new Promise((resolve) => waiting.push(resolve));
    },
    close() {
      signal.removeEventListener('abort', stop);
      lines.close();
      input.destroy();
    },
  };
}
