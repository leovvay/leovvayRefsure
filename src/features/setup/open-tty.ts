import { closeSync, openSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isatty, ReadStream } from 'node:tty';
import type { TtyPrompter } from './tty-prompter';

/**
 * The terminal's own ends, not stdin and stdout: `/dev/tty`, or on Windows the console. A Windows process whose
 * input is piped (an agent's) still has a console nobody types into, so there only a console on stdin counts. The
 * device paths are spelled in full: Node reads a bare `CONIN$` as a file in the working directory.
 */
function openTerminal(): { read: number; write: number } | null {
  try {
    if (process.platform !== 'win32') {
      const fd = openSync('/dev/tty', 'r+');
      return { read: fd, write: fd };
    }
    if (!isatty(0)) return null;
    const read = openSync('\\\\.\\CONIN$', 'r+');
    try {
      return { read, write: openSync('\\\\.\\CONOUT$', 'r+') };
    } catch {
      closeSync(read);
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Opens the terminal (`/dev/tty`, or the Windows console), or `null` when there is none (an agent's pipe, CI). Lines
 * are read in the terminal's own line mode, so its echo and editing work, and asynchronously, so an interrupt lands.
 */
export function openTty(signal: AbortSignal): TtyPrompter | null {
  const terminal = openTerminal();
  if (terminal === null) return null;
  const fd = terminal.write;
  const release = (): void => {
    if (terminal.write !== terminal.read) closeSync(terminal.write);
  };
  let input: ReadStream;
  try {
    input = new ReadStream(terminal.read);
  } catch {
    closeSync(terminal.read);
    release();
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
      release();
    },
  };
}
