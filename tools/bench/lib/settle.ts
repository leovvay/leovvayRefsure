import { closesOrRejects } from '../../../src/features/dismiss/dismiss-reading';
import { vetoOf } from '../../../src/features/dismiss/dismiss-veto';
import { classifyNames, maxRisk } from '../../../src/risk';
import type { RiskClass } from '../../../src/risk';
import type { ProviderId, SiteId } from '../../../src/questions';
import type { BenchItem } from './items';
import type { QualityRow, R1Read } from './ledger';
import { riskOf, rowThreshold } from './thresholds';

/*
  2.7: refsure's pure, name-level settle functions replayed on an acted row, from the raw accessible names (and
  roles) every captured item carries in `settleInputs`, indexed by caller index.
  - dismiss: `vetoOf(rawName)` refuses a vetoed pick (no act); `closesOrRejects(rawName)` marks close-word authority.
    Without it the pick needs agreement under `agree` and is a proposal under one provider (`settleDismissPick`);
    a proposal stays acted (Terms, A1: it hands back `act --ticket` at read risk).
  - every candidate site: the twin rule is already in R1 (2.1).
  - locate/find: the name-level class `classifyNames([rawName], ...)`, and the act re-read at the row of
    max(item risk, that class), as locate-settle.ts `underRow` re-reads; without an item risk the class has
    locate-settle's floor of write. A part whose confidence is under its re-read row abstains `low_confidence`.
  Not replayed (they need a live page): dismissRisk, confirm dialogs, page raisers, clickRisk's page probes and the
  row context. So "after" is a lower bound on what refsure's full settle layer refuses, and is labelled so.
*/

export const NO_SETTLE_INPUTS = 'inconclusive (no settle inputs)';
export const SETTLE_LABEL = 'name-level settle replay (lower bound on the full settle layer)';

/** One model part whose act the re-read checks: its provider, its configured model and the confidence it acted at. */
export interface ActingPart { provider: ProviderId; model: string; confidence: number | null }

/** The act before settle, as R1 read it. */
export interface SettleAct {
  r1: R1Read | null;
  acted: boolean;
  correct: boolean;
  dangerous: boolean;
  /** The shipped wording hash the row's threshold keyed on. */
  wordingHash: string;
  /** Single arm: its one part. `agree`: every part. `fallback`: the part that answered. */
  acting: readonly ActingPart[];
  /** The Decision was an `agree` both providers passed (authority without a close word). */
  agreed: boolean;
}

export interface Settled {
  vetoed: boolean | null;
  veto_term: string | null;
  close_word: boolean | null;
  /** Dismiss only: acted without close-word authority or agreement, so refsure proposes with a read ticket. */
  proposal: boolean | null;
  name_class: RiskClass | null;
  name_reasons: string[] | null;
  reread: { class: RiskClass; thresholds: (number | null)[]; kept: boolean } | null;
  /** The act after the replay; correct and dangerous only count while it still acts. */
  acted: boolean;
  correct: boolean;
  dangerous: boolean;
  label: typeof SETTLE_LABEL;
}

function unchanged(act: SettleAct): Settled {
  return {
    vetoed: null, veto_term: null, close_word: null, proposal: null, name_class: null, name_reasons: null, reread: null,
    acted: act.acted, correct: act.correct && act.acted, dangerous: act.dangerous && act.acted, label: SETTLE_LABEL,
  };
}

/** The raw name and role of the control at caller index `value`, or null when the item lacks them. */
function rawAt(item: BenchItem, value: unknown): { name: string; role: string | null } | null {
  const index = typeof value === 'number' ? value : Number(value);
  const names = item.settleInputs?.names;
  if (!Number.isInteger(index) || !names || typeof names[index] !== 'string') return null;
  return { name: names[index]!, role: item.settleInputs?.roles?.[index] ?? null };
}

/**
 * The 2.7 replay of one act. Non-acted rows, and sites with no name-level rule beyond the twin rule (page-state,
 * outcome, presence, option-map), come back unchanged. A candidate act whose raw name is missing reads
 * `inconclusive (no settle inputs)`.
 */
export function settleReplay(item: BenchItem, site: SiteId, act: SettleAct): Settled | typeof NO_SETTLE_INPUTS {
  if (!act.acted || act.r1?.verdict !== 'answer') return unchanged(act);
  if (site !== 'dismiss' && site !== 'locate' && site !== 'find') return unchanged(act);
  const raw = rawAt(item, act.r1.value);
  if (raw === null) return NO_SETTLE_INPUTS;
  const out = unchanged(act);
  if (site === 'dismiss') {
    const veto = vetoOf(raw.name);
    out.vetoed = veto !== null;
    out.veto_term = veto?.term ?? null;
    out.close_word = closesOrRejects(raw.name);
    out.proposal = !out.vetoed && !out.close_word && !act.agreed;
    out.acted = !out.vetoed;
  } else {
    const named = classifyNames([raw.name], { url: '', action: 'click', role: raw.role });
    const risk = riskOf(item.risk);
    const cls = maxRisk(risk ?? 'write', named.class);
    out.name_class = named.class;
    out.name_reasons = named.reasons;
    const thresholds = act.acting.map((part) => {
      const row = rowThreshold(site, part.provider, cls, part.model, act.wordingHash).threshold;
      return typeof row === 'number' ? row : null;
    });
    const kept = act.acting.every((part, at) => {
      const row = thresholds[at];
      return row === null || row === undefined || (part.confidence !== null && part.confidence >= row);
    });
    out.reread = { class: cls, thresholds, kept };
    out.acted = kept;
  }
  out.correct = act.correct && out.acted;
  out.dangerous = act.dangerous && out.acted;
  return out;
}

/** The settle of one single-arm quality row (ask.ts `AskRowOptions.settle`), at the arm's configured model. */
export function settleRow(item: BenchItem, row: QualityRow, armModel: string): Settled | typeof NO_SETTLE_INPUTS {
  const r1 = row.r1;
  return settleReplay(item, item.site, {
    r1, acted: r1?.verdict === 'answer', correct: row.correct === true, dangerous: row.dangerous === true,
    wordingHash: row.wording_hash,
    acting: [{ provider: row.provider as ProviderId, model: armModel, confidence: r1?.confidence ?? null }],
    agreed: false,
  });
}

/** `settleRow` bound to an arm's model, in the shape `askRow` takes. */
export function settleHook(armModel: string): (item: BenchItem, row: QualityRow) => unknown {
  return (item, row) => settleRow(item, row, armModel);
}
