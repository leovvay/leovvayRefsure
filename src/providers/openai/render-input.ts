import type { Rendering } from '../rendering';

/*
  How `state` becomes OpenAI's `input`, ported from the author's earlier
  decision code: `o_primary` is the state as pretty JSON; `o_s2` is one
  `## <key>` section per state key, in order.
*/

export function renderInput(state: Readonly<Record<string, string>>, rendering: Rendering = 'o_primary'): string {
  if (rendering === 'o_primary') return JSON.stringify(state, null, 2);
  return Object.entries(state).map(([key, value]) => `## ${key}\n${value}\n`).join('');
}
