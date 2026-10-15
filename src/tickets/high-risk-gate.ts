import type { Ref } from '../browser';
import type { CommandContext } from '../cli';
import { cutName, norm } from '../page-model';
import { actionRole, HIGH_RISK, liveRefRisk, maxRisk, nameCheck, readLiveTarget, type RiskReading } from '../risk';
import type { HighRiskGateResult } from './high-risk-gate-result';
import type { HighRiskRequest } from './high-risk-request';
import { recheck } from './recheck';
import type { Ticket } from './ticket';

/** A ticket carries a high-risk act only at this confidence, or when code settled the pick (spec §6.3). */
export const HIGH_RISK_CONFIDENCE = 0.85;

type Stop = Extract<HighRiskGateResult, { ok: false }>;
/** Whether a stop leaves the ticket for another try (`kept`) or comes after it was claimed (`spent`). */
type Held = 'kept' | 'spent' | 'none';

function stop(status: Stop['status'], cause: string, detail: string, computed?: RiskReading): Stop {
  return computed ? { ok: false, status, cause, detail, computed } : { ok: false, status, cause, detail };
}

function nothing(held: Held): string {
  if (held === 'kept') return 'nothing was done; the ticket is kept';
  if (held === 'spent') return 'nothing was done, and the ticket is spent: locate again for a new one';
  return 'nothing was done';
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

/** `--risk` raises the fresh read, never lowers it (spec §8.1 invariant 4). */
function raised(risk: RiskReading, user: HighRiskRequest['risk']): RiskReading {
  if (user === undefined || maxRisk(risk.class, user) === risk.class) return risk;
  return { class: maxRisk(risk.class, user), reasons: [...risk.reasons, 'user:--risk'] };
}

function classCheck(req: HighRiskRequest, risk: RiskReading, held: Held): Stop | null {
  if (risk.class === req.class) return null;
  const why = `${risk.class} (${risk.reasons.join(', ')})`;
  const read = 'ticket' in req
    ? 'the class a fresh read of the ticket gives (refsure guard --ticket shows it)'
    : 'the class this live ref reads now';
  const tail = HIGH_RISK.has(risk.class) ? `--class must name ${read}` : 'it is not a high-risk class: use act or outcome';
  return stop('refused', 'high_risk_class', `the element reads ${why}, not ${req.class}: ${tail}; ${nothing(held)}`, risk);
}

/** The recheck (spec §8.3) and the class check on its fresh risk, for a ticket either still kept or just claimed. */
async function checkTicket(ctx: CommandContext, req: HighRiskRequest, ticket: Ticket, held: Held): Promise<HighRiskGateResult> {
  const fresh = await recheck(ctx, ticket, { action: req.action });
  if ('stale' in fresh) {
    const what = fresh.stale === 'ref_gone'
      ? `the element of ticket ${ticket.id} is no longer on the page`
      : `the page changed since ticket ${ticket.id}`;
    return stop('stale', fresh.stale, `${what}; ${nothing(held)}`);
  }
  const risk = raised(fresh.risk, req.risk);
  const mismatch = classCheck(req, risk, held);
  if (mismatch) return mismatch;
  const element = `${ticket.fingerprint.role} ${JSON.stringify(cutName(ticket.fingerprint.name))}`;
  return { ok: true, ref: fresh.ref, risk, element };
}

/**
 * The ticket path. Every check runs once on the peeked ticket before it is spent, as `act` does: a closed tab, Orca
 * down, a page that moved or a class that does not match leaves the ticket for another try. Then it is claimed
 * and rechecked again, so two racing callers still get one act; under --dry-run it is never claimed.
 */
async function byTicket(ctx: CommandContext, req: HighRiskRequest & { ticket: Ticket }): Promise<HighRiskGateResult> {
  const unfit = ticketUnfit(req.ticket);
  if (unfit) return unfit;
  const before = await checkTicket(ctx, req, req.ticket, 'kept');
  if (!before.ok || ctx.dryRun) return before;
  const claimed = await ctx.tickets.claim(req.ticket.id, ctx.now());
  if (claimed === 'ticket_used') return stop('stale', 'ticket_used', `ticket ${req.ticket.id} was already used; tickets are single use`);
  if (claimed === 'ticket_expired') return stop('stale', 'ticket_expired', `ticket ${req.ticket.id} has expired; tickets live 120 s`);
  return checkTicket(ctx, req, claimed, 'spent');
}

async function byRef(ctx: CommandContext, req: HighRiskRequest & { ref: Ref; expectName: string }): Promise<HighRiskGateResult> {
  const { page, action, ref } = req;
  const tab = await ctx.browser.tabInfo(page);
  const target = await readLiveTarget(ctx.browser, page, ref, action);
  // Whole words only: on the one path for these classes, "e" never stands for "Delete project".
  const named = nameCheck(target.live, req.expectName, 'words');
  if (named !== 'ok') {
    const shown = named.mismatch === '' ? 'no name' : JSON.stringify(named.mismatch);
    return stop('stale', 'expect_name_mismatch',
      `@${ref} shows ${shown}, not ${JSON.stringify(req.expectName)} as whole words; nothing was done`);
  }
  const risk = await liveRefRisk(ctx.browser, page, ref, action, target, {
    url: tab.url, ...(req.risk === undefined ? {} : { userRisk: req.risk }),
  });
  const mismatch = classCheck(req, risk, 'none');
  if (mismatch) return mismatch;
  const element = `${target.role ?? actionRole(action)} ${JSON.stringify(cutName(norm(target.live.seen)))}`;
  return { ok: true, ref, risk, element };
}

/**
 * The checks `act-high-risk` shares (spec §6.3), all before anything is dispatched and none of them a Decision:
 * a ticket must be fit (≥0.85 or code-settled, a measured family, no twins) and is rechecked on a fresh snapshot,
 * before and after it is claimed; a live ref must still show `expectName` as whole words, read without a snapshot.
 * Either way, the fresh risk (raised by `--risk`) must be exactly the class the caller named. Browser failures
 * propagate for the registry to map.
 */
export function gateHighRisk(ctx: CommandContext, req: HighRiskRequest): Promise<HighRiskGateResult> {
  return 'ticket' in req ? byTicket(ctx, req) : byRef(ctx, req);
}
