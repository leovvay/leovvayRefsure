import type { Lexicon } from './lexicon';

const cancelVerbs = ['cancel', 'terminate', 'end'];

export const EN: Lexicon = {
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
    'grant access', 'security code', 'sign-in', 'sign-up', 'log-in', 'signin', 'signup', 'create account',
    'create an account',
  ],
  authDefer: [
    'log in later', 'login later', 'sign in later', 'sign up later', 'register later', 'skip login', 'skip log in',
    'skip logging in', 'skip sign in', 'skip sign-in', 'skip signin', 'skip signing in', 'skip sign up', 'skip sign-up',
    'skip signup', 'skip registration', 'without login', 'without logging in', 'without signing in',
    'without signing up', 'without registering', 'without registration', 'without an account', 'without account',
    'as guest', 'as a guest',
  ],
  consent: [
    'accept', 'accept all', 'agree', 'i agree', 'allow cookies', 'allow all', 'opt in', 'opt-in', 'consent',
    'i accept', 'allow', 'subscribe', 'accepted', 'agreed',
  ],
  dismissClose: [
    'close', 'reject', 'reject all', 'no thanks', 'no, thanks', 'later', 'maybe later', 'not now', 'dismiss',
    'skip', 'decline', '×', '✕', '✖',
  ],
  dismissVeto: [
    'accept', 'agree', 'allow', 'subscribe', 'buy', 'trial', 'enable', 'upgrade', 'manage', 'settings',
    'preferences', 'customize', 'customise',
    // Past forms say yes too ("Agreed, close"). Never the -ing form: "Continue without accepting" rejects.
    'accepted', 'agreed',
  ],
  cancelContext: ['subscription', 'order', 'account', 'booking', 'membership', 'reservation', 'plan', 'payment'],
  cancelVerbs,
  cancelWords: [...cancelVerbs, 'no', 'go back', 'back', 'keep', 'never mind', 'nevermind'],
  confirmCue: [
    'are you sure', 'confirm', 'cannot be undone', "can't be undone", 'permanently', 'irreversible',
    'this action', 'do you want to',
  ],
};
