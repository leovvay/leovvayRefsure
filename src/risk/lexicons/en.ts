import type { LanguageLexicon } from './language-lexicon';

const cancelVerbs = ['cancel', 'terminate', 'end'];

export const EN: LanguageLexicon = {
  lang: 'en',
  money: [
    'pay', 'pay now', 'buy', 'buy now', 'purchase', 'order', 'place order', 'checkout', 'check out', 'top up',
    'add funds', 'proceed to payment', 'complete purchase', 'card number', 'cvv', 'cvc', 'iban', 'donate',
    'transfer', 'withdraw',
  ],
  irreversible: [
    'delete', 'remove', 'send', 'publish', 'revoke', 'erase', 'destroy', 'permanently', 'close account',
    'deactivate', 'discard', 'unsubscribe', 'wipe', 'cancel subscription', 'terminate',
  ],
  auth: [
    'sign in', 'log in', 'login', 'sign up', 'password', '2fa', 'two-factor', 'authorize', 'authorise',
    'switch account', 'verification code', 'one-time code', 'continue with google', 'continue with apple',
    'grant access', 'security code',
  ],
  consent: [
    'accept', 'accept all', 'agree', 'i agree', 'allow cookies', 'allow all', 'opt in', 'opt-in', 'consent',
    'i accept', 'allow', 'subscribe',
  ],
  dismissClose: [
    'close', 'reject', 'reject all', 'no thanks', 'no, thanks', 'later', 'maybe later', 'not now', 'dismiss',
    'skip', 'decline', '×', '✕', '✖',
  ],
  dismissVeto: [
    'accept', 'agree', 'allow', 'subscribe', 'buy', 'trial', 'enable', 'upgrade', 'manage', 'settings',
    'preferences', 'customize', 'customise',
  ],
  cancelContext: ['subscription', 'order', 'account', 'booking', 'membership', 'reservation', 'plan', 'payment'],
  cancelVerbs,
  cancelWords: [...cancelVerbs, 'no', 'go back', 'keep'],
  confirmCue: [
    'are you sure', 'confirm', 'cannot be undone', "can't be undone", 'permanently', 'irreversible',
    'this action', 'do you want to',
  ],
};
