import type { SecretShape } from './secret-shape';

// Formats rather than vendors. A private key cut short by a bound still goes, up to the end of the text.
export const TOKEN_SHAPES: readonly SecretShape[] = [
  {
    family: 'private-key',
    re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/g,
  },
  { family: 'jwt', re: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g },
];
