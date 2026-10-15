import type { BrowserCapability } from '../capability';

export const ORCA_FEATURES: ReadonlySet<BrowserCapability> = new Set<BrowserCapability>([
  'highlight', 'dialog', 'console', 'network', 'count', 'attr', 'selector-text',
]);
