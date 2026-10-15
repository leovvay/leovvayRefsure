// C0 and C1 controls except \t (09) and \n (0A); a \r\n pair keeps its \n.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function stripControl(text: string): string {
  return text.replace(CONTROL, '');
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Cuts `text` to at most `max` UTF-16 units, the last one a `…` when anything was cut, and never inside a
 * surrogate pair. `inline` first turns every whitespace run into one space and trims. Strip and redact
 * before cutting: a cut secret no longer matches its shape.
 */
export function boundText(text: string, opts: { max: number; inline?: boolean }): string {
  const value = opts.inline ? text.replace(/\s+/g, ' ').trim() : text;
  const max = Number.isNaN(opts.max) ? 0 : Math.max(0, Math.floor(opts.max));
  if (value.length <= max) return value;
  if (max === 0) return '';
  let end = max - 1;
  if (end > 0 && isHighSurrogate(value.charCodeAt(end - 1))) end -= 1;
  return `${value.slice(0, end)}…`;
}
