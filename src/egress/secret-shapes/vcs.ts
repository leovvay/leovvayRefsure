import type { SecretShape } from './secret-shape';

// Code hosts and package registries.
export const VCS_SHAPES: readonly SecretShape[] = [
  { family: 'github', re: /(?<![A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{36,255}(?![A-Za-z0-9])/g },
  { family: 'github', re: /(?<![A-Za-z0-9_])github_pat_[A-Za-z0-9_]{22,255}/g },
  { family: 'gitlab', re: /(?<![A-Za-z0-9_-])gl(?:pat|dt|rt|ptt|ft|soat|cbt)-[A-Za-z0-9_-]{20,}/g },
  { family: 'npm', re: /(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g },
  { family: 'pypi', re: /(?<![A-Za-z0-9_-])pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/g },
  { family: 'atlassian', re: /(?<![A-Za-z0-9_])ATATT[A-Za-z0-9_=-]{30,}/g },
];
