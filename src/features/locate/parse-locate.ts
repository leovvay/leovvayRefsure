import { oneLine, type ParsedArgs, parseRisk, type UsageError } from '../../cli';
import { RANK_MAX } from '../../page-model';
import { BOUNDS } from '../../questions';
import type { LocateArgs } from './locate.args';

function parseTop(value: unknown): number | null | UsageError {
  if (value === undefined) return null;
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || n > RANK_MAX) return { usage: `--top must be a whole number from 1 to ${RANK_MAX}` };
  return n;
}

/** `--intent` or `--recorded` (or both: the recorded line, with the intent as its step intent). */
export function parseLocate(raw: ParsedArgs): LocateArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `locate takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'locate takes nothing after --' };
  const intent = oneLine(raw.values.intent);
  if (intent === '') return { usage: '--intent is empty: say what the element is for, or leave it out' };
  if (intent !== null && intent.length > BOUNDS.INTENT_MAX) {
    return { usage: `--intent is ${intent.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  // A line copied from `snap` carries ` #<ordinal>/<twins> @eN`, which a v1 line never does.
  const recorded = typeof raw.values.recorded === 'string'
    ? raw.values.recorded.trim().replace(/\s+#\d+\/\d+(?:\s+@e\d+)?$/, '')
    : null;
  if (recorded === '') return { usage: '--recorded is empty: pass the v1 line you recorded, or leave it out' };
  if (recorded !== null && recorded.length > BOUNDS.CANDIDATE_LINE_MAX) {
    return { usage: `--recorded is ${recorded.length} characters; keep it to ${BOUNDS.CANDIDATE_LINE_MAX}` };
  }
  if (intent === null && recorded === null) {
    return { usage: 'locate needs --intent "<what the element is for>" or --recorded \'<role> "<name>" in="<path>"\'' };
  }
  const within = oneLine(raw.values.within);
  if (within === '') return { usage: '--within is empty: give text from the row you mean, or leave it out' };
  if (within !== null && within.length > BOUNDS.INTENT_MAX) {
    return { usage: `--within is ${within.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  const risk = parseRisk(raw.values.risk);
  if (typeof risk === 'object') return risk;
  const top = parseTop(raw.values.top);
  if (typeof top === 'object' && top !== null) return top;
  return {
    intent,
    recorded,
    within,
    first: raw.values.first === true,
    top,
    ...(risk === undefined ? {} : { risk }),
  };
}
