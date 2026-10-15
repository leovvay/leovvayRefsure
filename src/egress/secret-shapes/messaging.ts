import type { SecretShape } from './secret-shape';

// Chat, webhook and e-mail delivery services. A webhook URL is itself the secret, so the whole URL goes.
export const MESSAGING_SHAPES: readonly SecretShape[] = [
  { family: 'slack', re: /(?<![A-Za-z0-9_-])xox[abposr]-[A-Za-z0-9-]{10,}/g },
  { family: 'slack', re: /(?<![A-Za-z0-9_-])xapp-[A-Za-z0-9-]{20,}/g },
  { family: 'slack-webhook', re: /https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9_/-]{20,}/g },
  {
    family: 'discord-webhook',
    re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{30,}/g,
  },
  { family: 'telegram', re: /(?<![A-Za-z0-9_])\d{8,10}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/g },
  { family: 'sendgrid', re: /(?<![A-Za-z0-9_])SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g },
  { family: 'twilio', re: /(?<![A-Za-z0-9])SK[0-9a-fA-F]{32}(?![A-Za-z0-9])/g },
  { family: 'mailgun', re: /(?<![A-Za-z0-9_-])key-[0-9a-f]{32}(?![A-Za-z0-9])/g },
  { family: 'mailchimp', re: /(?<![A-Za-z0-9])[0-9a-f]{32}-us\d{1,2}(?![A-Za-z0-9])/g },
];
