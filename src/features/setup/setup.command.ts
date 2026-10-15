import type { CommandOutcome, CommandSpec, UsageError } from '../../cli';
import {
  currentConsent, DISCLOSURE_HASH, DISCLOSURE_TEXT, readConsent, withGrant, withoutGrant, writeConsent,
} from '../../egress';
import type { Consent } from '../../egress';
import { keyPresent } from '../../providers';
import type { ProviderSlot } from '../../providers';
import { rosterOf } from '../shared';
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
function applyAnswers(consent: Consent | null, answers: readonly SetupGrant[], at: Date): Consent {
  return answers.reduce((next, answer) => (answer.granted
    ? withGrant(next, answer.provider, answer.host, at)
    : withoutGrant(next, answer.provider, answer.host)), currentConsent(consent));
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
    const roster = Object.values(rosterOf(ctx.config, ctx.env));
    // Each provider that can be asked about, with the host its page text would go to.
    const targets = roster.flatMap((slot) => (
      slot.problem === null && slot.endpoint ? [{ slot, host: slot.endpoint.host }] : []
    ));
    if (targets.length === 0) {
      return notSetUp(roster.map((slot) => slot.problem ?? slot.id).join('; '));
    }
    if (ctx.dryRun) {
      const asks = targets.map(({ slot, host }) => ({ provider: slot.id, host, phrase: phraseFor(host) }));
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
      for (const { slot, host } of targets) {
        const line = await tty.ask(await promptFor(slot, host));
        if (line === null) break;
        const granted = line.trim() === phraseFor(host);
        answers.push({ provider: slot.id, host, granted });
        tty.write(granted ? `Granted: ${slot.id} at ${host}.\n` : `Not granted: ${slot.id} at ${host}.\n`);
      }
    } finally {
      tty.close();
    }
    const unanswered = targets.slice(answers.length).map(({ host }) => host);
    if (ctx.signal.aborted) return notSetUp('setup was interrupted: nothing was written');
    // No answer at all is a consent step that did not happen, not one that succeeded with nothing granted.
    if (answers.length === 0) return notSetUp(`${NO_ANSWER}: ${unanswered.join(', ')}`);
    const consentPath = ctx.config.paths.consent;
    writeConsent(consentPath, applyAnswers(readConsent(consentPath), answers, new Date(ctx.now())));
    const result: SetupResult = { grants: answers, consent: consentPath, disclosure_hash: DISCLOSURE_HASH, unanswered };
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
