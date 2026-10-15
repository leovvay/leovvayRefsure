import type { Ref } from '../browser';
import type { CommandContext } from '../cli';
import { cutName, norm } from '../page-model';
import { actionRole, HIGH_RISK, liveRefRisk, nameCheck, readLiveTarget, type RiskReading } from '../risk';
import type { HighRiskGateResult } from './high-risk-gate-result';
import type { HighRiskRequest } from './high-risk-request';
import { recheck } from './recheck';
import type { Ticket } from './ticket';

/** A ticket carries a high-risk act only at this confidence, or when code settled the pick (spec §6.3). */
export const HIGH_RISK_CONFIDENCE = 0.85;

type Stop = Extract<HighRiskGateResult, { ok: false }>;

function stop(status: Stop['status'], cause: string, detail: string, computed?: RiskReading): Stop {
  return computed ? { ok: false, status, cause, detail, computed } : { ok: false, status, cause, detail };
}

/**
 * Why a ticket may not carry a high-risk act, or `null` when it may (spec §6.3): its pick was settled by code or
 * made at ≥0.85, by a model family refsure has measured, and its element has no identical twin.
 */
export function ticketUnfit(ticket: Ticket): Stop | null {
  if (ticket.authority === 'none') {
    return stop('abstained', 'proposed_only', `ticket ${ticket.id} was picked by a model family refsure has not measured: propose only`);
  }
  if (ticket.site !== 'code' && (ticket.confidence === null || ticket.confidence < HIGH_RISK_CONFIDENCE)) {
    const at = ticket.confidence === null ? 'no confidence' : String(ticket.confidence);
    return stop('abstained', 'low_confidence',
      `ticket ${ticket.id} was picked at ${at}; a high-risk act takes a ticket at ${HIGH_RISK_CONFIDENCE} or one code settled`);
  }
  if (ticket.fingerprint.twins !== 1) {
    return stop('abstained', 'twins',
      `ticket ${ticket.id} names one of ${ticket.fingerprint.twins} identical elements; a high-risk act takes only a unique one: `
        + 'use your own ref (--ref @eN --expect-name) after checking its row');
  }
  return null;
}

function classCheck(given: HighRiskRequest['class'], risk: RiskReading): Stop | null {
  if (risk.class === given) return null;
  const why = `${risk.class} (${risk.reasons.join(', ')})`;
  const tail = HIGH_RISK.has(risk.class)
    ? `--class must name the class a fresh read gives (refsure guard shows it)`
    : 'it is not a high-risk class: use act or outcome';
  return stop('refused', 'high_risk_class', `the element reads ${why}, not ${given}: ${tail}; nothing was done`, risk);
}

async function byTicket(ctx: CommandContext, req: HighRiskRequest & { ticket: Ticket }): Promise<HighRiskGateResult> {
  const unfit = ticketUnfit(req.ticket);
  if (unfit) return unfit;
  // Spend it before the fresh read, as `act` does (spec §8.3); under --dry-run it is only peeked.
  const claimed = ctx.dryRun ? req.ticket : await ctx.tickets.claim(req.ticket.id, ctx.now());
  if (claimed === 'ticket_used') return stop('stale', 'ticket_used', `ticket ${req.ticket.id} was already used; tickets are single use`);
  if (claimed === 'ticket_expired') return stop('stale', 'ticket_expired', `ticket ${req.ticket.id} has expired; tickets live 120 s`);
  const fresh = await recheck(ctx, claimed, { action: req.action });
  if ('stale' in fresh) {
    const detail = fresh.stale === 'ref_gone'
      ? `the element of ticket ${claimed.id} is no longer on the page; nothing was done`
      : `the page changed since ticket ${claimed.id}; nothing was done`;
    return stop('stale', fresh.stale, detail);
  }
  const mismatch = classCheck(req.class, fresh.risk);
  if (mismatch) return mismatch;
  const element = `${claimed.fingerprint.role} ${JSON.stringify(cutName(claimed.fingerprint.name))}`;
  return { ok: true, ref: fresh.ref, risk: fresh.risk, element };
}

async function byRef(ctx: CommandContext, req: HighRiskRequest & { ref: Ref; expectName: string }): Promise<HighRiskGateResult> {
  const { page, action, ref } = req;
  const tab = await ctx.browser.tabInfo(page);
  const target = await readLiveTarget(ctx.browser, page, ref, action);
  const named = nameCheck(target.live, req.expectName);
  if (named !== 'ok') {
    const shown = named.mismatch === '' ? 'no name' : JSON.stringify(named.mismatch);
    return stop('stale', 'expect_name_mismatch', `@${ref} shows ${shown}, not ${JSON.stringify(req.expectName)}; nothing was done`);
  }
  const risk = await liveRefRisk(ctx.browser, page, ref, action, target, { url: tab.url });
  const mismatch = classCheck(req.class, risk);
  if (mismatch) return mismatch;
  const element = `${target.role ?? actionRole(action)} ${JSON.stringify(cutName(norm(target.live.seen)))}`;
  return { ok: true, ref, risk, element };
}

/**
 * The checks `act-high-risk` shares (spec §6.3), all before anything is dispatched and none of them a Decision:
 * a ticket must be fit (≥0.85 or code-settled, a measured family, no twins), is claimed, and is rechecked on a fresh
 * snapshot; a live ref must still show `expectName`, read without a snapshot. Either way, the fresh risk must be
 * exactly the class the caller named. Browser failures propagate for the registry to map.
 */
export function gateHighRisk(ctx: CommandContext, req: HighRiskRequest): Promise<HighRiskGateResult> {
  return 'ticket' in req ? byTicket(ctx, req) : byRef(ctx, req);
}
