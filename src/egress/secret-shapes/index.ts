import { AI_SHAPES } from './ai';
import { CLOUD_SHAPES } from './cloud';
import { GENERIC_SHAPES } from './generic';
import { MESSAGING_SHAPES } from './messaging';
import { PAYMENT_SHAPES } from './payments';
import type { SecretShape } from './secret-shape';
import { TOKEN_SHAPES } from './tokens';
import { VCS_SHAPES } from './vcs';

export type * from './secret-shape';

/**
 * Every shape, in the order `redactSecrets` applies them: whole blocks and formats first (a PEM block or a
 * JWT may hold anything), vendor prefixes next, context shapes last. Written fresh for refsure.
 */
export const SECRET_SHAPES: readonly SecretShape[] = Object.freeze([
  ...TOKEN_SHAPES, ...AI_SHAPES, ...VCS_SHAPES, ...PAYMENT_SHAPES, ...MESSAGING_SHAPES, ...CLOUD_SHAPES,
  ...GENERIC_SHAPES,
].map((shape) => Object.freeze({ ...shape })));
