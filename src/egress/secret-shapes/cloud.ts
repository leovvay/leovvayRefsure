import type { SecretShape } from './secret-shape';

const AWS_KEY_ID = '(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}';

// The two secret-key rules read the access key id or the field name as context, so they run before the
// access key id itself is replaced.
export const CLOUD_SHAPES: readonly SecretShape[] = [
  {
    family: 'aws',
    re: /(?<=(?:aws_?)?secret_?access_?key["']?\s{0,4}[:=]\s{0,4}["']?)[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/gi,
  },
  {
    family: 'aws',
    re: new RegExp(`(?<=${AWS_KEY_ID}["']?[\\s,:;|=]{1,6}["']?)[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])`, 'g'),
  },
  { family: 'aws', re: new RegExp(`(?<![A-Za-z0-9])${AWS_KEY_ID}(?![A-Za-z0-9])`, 'g') },
  { family: 'aws', re: /(?<=(?:aws_?)?session_?token["']?\s{0,4}[:=]\s{0,4}["']?)[A-Za-z0-9/+=]{100,}/gi },
  { family: 'google', re: /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/g },
  { family: 'google', re: /(?<![A-Za-z0-9_-])ya29\.[A-Za-z0-9_-]{20,}/g },
  { family: 'google', re: /(?<![A-Za-z0-9_-])GOCSPX-[A-Za-z0-9_-]{28}(?![A-Za-z0-9_-])/g },
  { family: 'azure', re: /(?<=AccountKey=)[A-Za-z0-9+/]{86}==/g },
  { family: 'azure', re: /(?<=[?&]sig=)[A-Za-z0-9%+/=]{20,}/g },
  { family: 'digitalocean', re: /(?<![A-Za-z0-9_])do[opr]_v1_[a-f0-9]{64}(?![A-Za-z0-9])/g },
  { family: 'fly', re: /(?<![A-Za-z0-9_])f[mo][12]_[A-Za-z0-9+/=_-]{40,}/g },
];
