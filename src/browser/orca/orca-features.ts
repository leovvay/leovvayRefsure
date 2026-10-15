import type { BrowserCapability } from '../capability';

// `html` stays undeclared: Orca's `get --what html` returns innerHTML, which is empty for an input.
export const ORCA_FEATURES: ReadonlySet<BrowserCapability> = new Set<BrowserCapability>([
  'highlight', 'dialog', 'console', 'network', 'count', 'attr', 'selector-text',
]);
