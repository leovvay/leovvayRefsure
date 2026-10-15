import type { PartOutcome } from '../../providers';
import { bareModel } from '../calibration';

/**
 * What a complete answer that names no model is read and reported as. It is no family refsure knows, so the answer
 * reads as a new family (authority `none`, spec §8.6), never as the model that was asked for.
 */
export const UNNAMED_MODEL = 'unnamed';

/**
 * The model that replied to a part, bare: the name it gave, `unnamed` for a complete answer that gave none, and
 * `null` when no model replied (a timeout, a transport failure, a body that named nothing and answered nothing).
 */
export function answeringModel<Out>(part: PartOutcome<Out>): string | null {
  if (part.answer.model !== null) return bareModel(part.answer.model);
  return part.answer.status === 'ok' ? UNNAMED_MODEL : null;
}
