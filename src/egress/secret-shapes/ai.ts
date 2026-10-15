import type { SecretShape } from './secret-shape';

// Specific prefixes before the bare `sk-`, which would otherwise swallow them under the wrong family.
export const AI_SHAPES: readonly SecretShape[] = [
  { family: 'anthropic', re: /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,}/g },
  { family: 'openrouter', re: /(?<![A-Za-z0-9_-])sk-or-v1-[A-Za-z0-9]{32,}/g },
  // Real keys always carry a digit; the lookahead spares hyphenated words like `sk-learn-…`.
  { family: 'openai', re: /(?<![A-Za-z0-9_-])sk-(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/g },
  { family: 'huggingface', re: /(?<![A-Za-z0-9_])hf_[A-Za-z0-9]{30,}/g },
  { family: 'groq', re: /(?<![A-Za-z0-9_])gsk_[A-Za-z0-9]{40,}/g },
  { family: 'replicate', re: /(?<![A-Za-z0-9_])r8_[A-Za-z0-9]{30,}/g },
  { family: 'xai', re: /(?<![A-Za-z0-9_-])xai-[A-Za-z0-9]{40,}/g },
  { family: 'perplexity', re: /(?<![A-Za-z0-9_-])pplx-[A-Za-z0-9]{40,}/g },
];
