import type { SecretShape } from './secret-shape';

export const PAYMENT_SHAPES: readonly SecretShape[] = [
  { family: 'stripe', re: /(?<![A-Za-z0-9_])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { family: 'stripe', re: /(?<![A-Za-z0-9_])whsec_[A-Za-z0-9]{24,}/g },
  { family: 'square', re: /(?<![A-Za-z0-9_-])sq0(?:atp|csp)-[A-Za-z0-9_-]{22,}/g },
  { family: 'paypal', re: /access_token\$production\$[a-z0-9]{16}\$[a-f0-9]{32}/g },
  { family: 'shopify', re: /(?<![A-Za-z0-9_])shp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}(?![A-Za-z0-9])/g },
];
