import type { CrossCheck } from '../spend';
import { r4 } from './verdict';
import type { Cell, Table } from './verdict';

/*
  9.1 item 9 and 7.3: spend per phase and arm and the spend cross-check, from spend.ts's `spend-crosscheck.json`,
  as one table in section 9 beside Q14. Dollars print to 4 places and gaps (|a - b| / b) to 4 significant digits; the
  notes are the cross-check's own explain lines (each gap above 2%, or part left unchecked, that the report explains).
  An arm whose usage carries no `cost` (the OpenAI arms) sums its reported dollars to 0: printed `-`, not a zero.
*/

const SPEND_COLUMNS = ['check', 'phase', 'arm', 'ledger calls', 'ledger rows', 'gateway rows', 'call gap', 'priced $', 'reported $',
  'measured $', 'gap', 'note'];

/** A gap to 4 significant digits. */
function sig4(v: number | null | undefined): Cell {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toPrecision(4));
}

/** Reported `usage.cost` dollars; `-` when the arm reported none. */
function reported(usd: number): Cell {
  return usd > 0 ? r4(usd) : null;
}

/** The ledger's unpriced count as a note. */
function unpricedNote(n: number): string | null {
  return n > 0 ? `sent without a priceable usage: ${n}` : null;
}

/** One row in SPEND_COLUMNS order from the cells it fills. */
function row(check: string, phase: string | null, arm: string | null, c: Partial<Record<(typeof SPEND_COLUMNS)[number], Cell>>): Cell[] {
  return [check, phase, arm, ...SPEND_COLUMNS.slice(3).map((col) => c[col] ?? null)];
}

/** The 7.3 cross-check as written (an older file without the unmatched and total rows prints without them). */
export function spendTable(cc: Partial<CrossCheck> | null, miss: (what: string) => string): Table {
  const head = { anchor: 'spend', section: 9, title: 'Spend and the 7.3 cross-check' };
  if (cc === null) return { ...head, columns: ['reading'], rows: [[miss('spend-crosscheck.json (spend.ts)')]], notes: [] };
  const rows: Cell[][] = [];
  // Ledgers per phase and arm: every row of every file, priced from each wire's own usage (P4a apart from P4).
  for (const [phase, byArm] of Object.entries(cc.perPhase ?? {})) for (const [arm, s] of Object.entries(byArm)) {
    rows.push(row('ledger', phase, arm, { 'ledger calls': s.calls, 'ledger rows': s.rows, 'priced $': r4(s.priced), 'reported $': reported(s.reported),
      note: unpricedNote(s.unpriced) }));
  }
  // Ledger totals per arm over every phase, then over every arm.
  const perArm = cc.perArm ?? {};
  for (const [arm, s] of Object.entries(perArm)) {
    rows.push(row('ledger total', 'all', arm, { 'ledger calls': s.calls, 'priced $': r4(s.priced), 'reported $': reported(s.reported), note: unpricedNote(s.unpriced) }));
  }
  const all = Object.values(perArm).reduce((t, s) => ({ calls: t.calls + s.calls, priced: t.priced + s.priced, unpriced: t.unpriced + s.unpriced, reported: t.reported + s.reported }),
    { calls: 0, priced: 0, unpriced: 0, reported: 0 });
  // A reported sum over only the arms that report usage.cost would read as a shortfall against every arm's priced
  // sum: when any arm with calls reports none, the cell is `-` and a note names the arms it would cover.
  const reporting = Object.entries(perArm).filter(([, s]) => s.calls > 0 && s.reported > 0);
  const partial = reporting.length < Object.values(perArm).filter((s) => s.calls > 0).length;
  const sumOf = (k: 'priced' | 'reported') => reporting.reduce((t, [, s]) => t + s[k], 0);
  const partialNote = partial && reporting.length > 0
    ? `reported $ only on ${reporting.map(([arm]) => arm).join(', ')}: ${r4(sumOf('reported'))} (priced ${r4(sumOf('priced'))} on the same arms)` : null;
  rows.push(row('ledger total', 'all', 'every arm', { 'ledger calls': all.calls, 'priced $': r4(all.priced), 'reported $': partial ? null : reported(all.reported),
    note: [unpricedNote(all.unpriced), partialNote].filter(Boolean).join('; ') || null }));
  // (a) The gateway's spend rows split by each gateway arm's tag header, then the rows no arm claims and the total.
  if (cc.gatewayTagSplit === null || cc.gatewayTagSplit === undefined) rows.push(row('gateway tag split (7.3 a)', null, null, { note: 'unchecked (no gateway spend rows)' }));
  for (const [arm, g] of Object.entries(cc.gatewayTagSplit ?? {})) {
    rows.push(row('gateway tag split (7.3 a)', 'all', arm, { 'ledger calls': g.ledgerCalls, 'gateway rows': g.gatewayRows, 'call gap': sig4(g.callGap),
      'priced $': r4(g.priced), 'measured $': r4(g.measured), gap: sig4(g.gap) }));
  }
  if (cc.gatewayUnmatched) rows.push(row('gateway rows matching no arm', 'all', null, { 'gateway rows': cc.gatewayUnmatched.rows, 'measured $': r4(cc.gatewayUnmatched.spend) }));
  if (cc.gatewayTotal) rows.push(row('gateway rows, grand total', 'all', null, { 'gateway rows': cc.gatewayTotal.rows, 'measured $': r4(cc.gatewayTotal.spend) }));
  // (a) The bench key's own spend over each phase window, against the gateway arms' priced sums of that phase; a phase
  // whose gateway arms sent rows without a snapshot reads unread.
  for (const [phase, w] of Object.entries(cc.keyWindows ?? {})) {
    rows.push(row('key window (7.3 a)', phase, 'gateway arms', { 'priced $': r4(w.priced), 'measured $': w.measured === null ? null : r4(w.measured),
      gap: sig4(w.gap), note: w.snapshot === false ? 'unread (no snapshot)' : w.measured === null ? 'unread' : null }));
  }
  // (a) When P0 found the tags unrecorded: the bench key's spend per call over the P0 window, against the ledger's.
  for (const [arm, w] of Object.entries(cc.p0Window ?? {})) {
    rows.push(row('P0 window (7.3 a)', 'P0', arm, { 'priced $': sig4(w.pricedPerCall), 'measured $': sig4(w.measuredPerCall), gap: sig4(w.gap), note: 'per call' }));
  }
  // P7's CLI Decisions per cfg: refsure's own decision.usd (no token usage in that ledger, so no priced $).
  for (const [cfg, d] of Object.entries(cc.p7 ?? {})) {
    rows.push(row('P7 CLI decision.usd', 'P7', cfg, { 'ledger calls': d.decisions, 'reported $': reported(d.reported),
      note: d.unreportedParts > 0 ? `parts without a reported usd: ${d.unreportedParts}` : null }));
  }
  // (b) OpenRouter usage.cost on each direct arm, beside its ledger; (c) Claude total_cost_usd from the P8 agent ledger.
  for (const o of cc.openRouter ?? []) {
    rows.push(row('OpenRouter usage.cost (7.3 b)', 'all', o.arm, { 'ledger calls': perArm[o.arm]?.calls ?? null, 'priced $': r4(perArm[o.arm]?.priced ?? null),
      'reported $': reported(o.usageCost) }));
  }
  const c = cc.claude;
  rows.push(c ? row('Claude total_cost_usd (7.3 c)', 'P8', 'claude', { 'ledger rows': c.runs, 'reported $': r4(c.usd),
    note: c.unreported > 0 ? `${c.unreported} of ${c.runs} runs without a reported total_cost_usd` : null })
    : row('Claude total_cost_usd (7.3 c)', 'P8', null, { note: 'unchecked' }));
  return { ...head, columns: SPEND_COLUMNS, rows, notes: [...(cc.explain ?? [])] };
}
