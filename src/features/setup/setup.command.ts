import type { CommandOutcome, CommandSpec, UsageError } from '../../cli';
import { keySet } from '../../config';
import { DISCLOSURE_HASH, DISCLOSURE_TEXT, readConsent, withGrant, writeConsent } from '../../egress';
import type { Consent } from '../../egress';
import { keyPresent, providerRoster } from '../../providers';
import type { ProviderSlot } from '../../providers';
import { openTty } from './open-tty';
import type { SetupGrant } from './setup-grant';
import type { SetupPreview } from './setup-preview';
import type { SetupResult } from './setup.contract';

const NO_TTY = 'setup needs a human at a terminal: run `refsure setup` yourself in a terminal';
const NO_ANSWER = 'the terminal closed before any answer, so nothing was written; run `refsure setup` again for';

function phraseFor(host: string): string {
  return `send page text to ${host}`;
}

function notSetUp(detail: string): CommandOutcome<SetupResult | SetupPreview> {
  return { status: 'not_set_up', acted: false, effect: 'none', result: null, why: { cause: 'not_set_up', detail } };
}

/** The record after this run's answers: a typed phrase grants, anything else revokes, under today's disclosure. */
function applyAnswers(consent: Consent | null, answers: readonly SetupGrant[]): Consent {
  let next: Consent = consent && consent.disclosure === DISCLOSURE_HASH
    ? consent
    : { v: 1, disclosure: DISCLOSURE_HASH, grants: [] };
  for (const answer of answers) {
    if (answer.granted) {
      next = withGrant(next, answer.provider, answer.host, new Date());
      continue;
    }
    const host = answer.host.toLowerCase();
    const grants = next.grants.filter((grant) => !(grant.provider === answer.provider && grant.host.toLowerCase() === host));
    next = { ...next, grants };
  }
  return next;
}

async function promptFor(slot: ProviderSlot, host: string): Promise<string> {
  const label = slot.key?.label ?? `keys.${slot.keyName ?? slot.id}`;
  const keyNote = (await keyPresent(slot)) ? '' : ` (its key ${label} is not set yet)`;
  return `\nTo let refsure send page text to ${host} for ${slot.id}${keyNote}, type exactly:\n`
    + `  ${phraseFor(host)}\nAnything else, or just Enter, does not grant it.\n> `;
}

/**
 * Consent (spec §8.6): on the human's own terminal, the disclosure, then one typed phrase per provider host.
 * Keys are never asked for. Consent is a disclosure, not a control: an agent could fake a terminal.
 */
export const setupCommand: CommandSpec<Record<string, never>, SetupResult | SetupPreview> = {
  name: 'setup',
  summary: 'Read the disclosure and grant consent per provider host (a human, at a terminal)',
  since: '0.1.0',
  stability: 'stable',
  options: {},
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw): Record<string, never> | UsageError {
    if (raw.positionals.length > 0) return { usage: `setup takes no arguments, got ${raw.positionals.length}` };
    return {};
  },
  async run(_args, ctx) {
    const roster = providerRoster(ctx.config, keySet(ctx.config, ctx.env));
    const slots = Object.values(roster).filter((slot) => slot.problem === null && slot.endpoint !== null);
    if (slots.length === 0) {
      return notSetUp(Object.values(roster).map((slot) => slot.problem ?? slot.id).join('; '));
    }
    if (ctx.dryRun) {
      const asks = slots.map((slot) => ({ provider: slot.id, host: slot.endpoint!.host, phrase: phraseFor(slot.endpoint!.host) }));
      const preview: SetupPreview = { dry_run: true, would_ask: asks, disclosure_hash: DISCLOSURE_HASH };
      return {
        status: 'ok',
        acted: false,
        effect: 'none',
        result: preview,
        why: { cause: 'dry_run', detail: 'nothing was asked and nothing was written' },
      };
    }
    const tty = openTty(ctx.signal);
    if (!tty) return notSetUp(NO_TTY);
    const answers: SetupGrant[] = [];
    try {
      tty.write(`\n${DISCLOSURE_TEXT}\n`);
      for (const slot of slots) {
        const host = slot.endpoint!.host;
        const line = await tty.ask(await promptFor(slot, host));
        if (line === null) break;
        const granted = line.trim() === phraseFor(host);
        answers.push({ provider: slot.id, host, granted });
        tty.write(granted ? `Granted: ${slot.id} at ${host}.\n` : `Not granted: ${slot.id} at ${host}.\n`);
      }
    } finally {
      tty.close();
    }
    const unanswered = slots.slice(answers.length).map((slot) => slot.endpoint!.host);
    if (ctx.signal.aborted) return notSetUp('setup was interrupted: nothing was written');
    // No answer at all is a consent step that did not happen, not one that succeeded with nothing granted.
    if (answers.length === 0) return notSetUp(`${NO_ANSWER}: ${unanswered.join(', ')}`);
    writeConsent(ctx.config.paths.consent, applyAnswers(readConsent(ctx.config.paths.consent), answers));
    const result: SetupResult = { grants: answers, consent: ctx.config.paths.consent, disclosure_hash: DISCLOSURE_HASH, unanswered };
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
