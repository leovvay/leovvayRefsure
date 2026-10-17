import type { BrowserCapability } from '../capability';

// Read from `agent-browser --help` (0.27 prints a command per indented line, and the `get` targets on the line under
// "Get Info:").
const COMMANDS: readonly [BrowserCapability, RegExp][] = [
  ['highlight', /^\s+highlight\s+</m],
  ['console', /^\s+console\b/m],
  ['network', /^\s+requests\b/m],
  ['dialog', /^\s+dialog\s/m],
  ['press-enter', /^\s+press\s+</m],
  ['scroll', /^\s+scroll\s+</m],
];
const GET_TARGETS: readonly [BrowserCapability, string][] = [
  ['count', 'count'],
  ['attr', 'attr'],
  ['selector-text', 'text'],
];
const GET_INFO = /^Get Info:.*\r?\n\s+(?<targets>[^\r\n]+)/m;

/** The capabilities a help text shows. An unreadable help text shows none. */
export function featuresFromHelp(help: string | null): ReadonlySet<BrowserCapability> {
  const out = new Set<BrowserCapability>();
  if (help === null) return out;
  for (const [capability, line] of COMMANDS) {
    if (line.test(help)) out.add(capability);
  }
  const targets = (GET_INFO.exec(help)?.groups?.targets ?? '')
    .split(',')
    .map((target) => target.trim().split(/\s+/)[0] ?? '');
  for (const [capability, target] of GET_TARGETS) {
    if (targets.includes(target)) out.add(capability);
  }
  return out;
}
