import type { SecretShape } from './secret-shape';

// `name = value`, `"name": "value"`; a suffix match also covers access_token, client_secret, x-api-key.
const SECRET_NAMES = '(?:pass(?:word|wd|phrase)|\\bpwd|пароль|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)';

/*
  Context shapes: the secret is known by what stands before it. They run last, and none of them takes a
  value that is already `[redacted:…]`, so a vendor family named earlier survives.
*/
export const GENERIC_SHAPES: readonly SecretShape[] = [
  { family: 'url-credentials', re: /(?<=\b[A-Za-z][A-Za-z0-9+.-]{0,20}:\/\/)[^\s/?#@:]+:[^\s/?#@]+(?=@)/g },
  // A digit is required: a real token has one, prose after the word "bearer" rarely does.
  { family: 'bearer', re: /(?<=\bBearer\s{1,4})(?=[A-Za-z0-9._~+/-]*\d)[A-Za-z0-9._~+/-]{16,}=*/gi },
  {
    family: 'basic-auth',
    re: /(?<=\bAuthorization["']?\s{0,4}[:=]\s{0,4}["']?Basic\s{1,4})[A-Za-z0-9+/]{12,}={0,2}/gi,
  },
  {
    family: 'secret',
    re: new RegExp(`(?<=${SECRET_NAMES}["']?\\s{0,4}[:=]\\s{0,4}["']?)(?!\\[redacted:)[^\\s"'&<>]{8,}`, 'gi'),
  },
];
