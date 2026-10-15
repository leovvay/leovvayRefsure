import type { Lexicon } from './lexicon';

const cancelVerbs = ['abbrechen', 'stornieren', 'beenden'];

export const DE: Lexicon = {
  lang: 'de',
  money: [
    'bezahlen', 'jetzt bezahlen', 'zahlen', 'kaufen', 'jetzt kaufen', 'bestellen', 'zahlungspflichtig bestellen',
    'zur kasse', 'kasse', 'aufladen', 'guthaben aufladen', 'kartennummer', 'überweisen', 'spenden',
  ],
  irreversible: [
    'löschen', 'entfernen', 'senden', 'absenden', 'veröffentlichen', 'widerrufen', 'endgültig', 'unwiderruflich',
    'konto schließen', 'konto löschen', 'deaktivieren', 'kündigen', 'abmelden vom newsletter', 'verwerfen',
  ],
  auth: [
    'anmelden', 'einloggen', 'login', 'registrieren', 'passwort', 'kennwort', 'zwei-faktor', 'autorisieren',
    'konto wechseln', 'bestätigungscode', 'einmalcode', 'zugriff gewähren',
  ],
  consent: [
    'akzeptieren', 'alle akzeptieren', 'zustimmen', 'einverstanden', 'cookies erlauben', 'alle erlauben',
    'annehmen', 'einwilligen', 'erlauben', 'abonnieren',
  ],
  dismissClose: [
    'schließen', 'ablehnen', 'alle ablehnen', 'nein danke', 'nein, danke', 'später', 'nicht jetzt', 'überspringen',
    'ausblenden', '×',
  ],
  dismissVeto: [
    'akzeptieren', 'zustimmen', 'erlauben', 'abonnieren', 'kaufen', 'testen', 'aktivieren', 'upgrade',
    'verwalten', 'einstellungen', 'präferenzen', 'anpassen',
  ],
  cancelContext: ['abonnement', 'abo', 'bestellung', 'konto', 'buchung', 'mitgliedschaft', 'vertrag'],
  cancelVerbs,
  cancelWords: [...cancelVerbs, 'nein', 'zurück'],
  confirmCue: [
    'sind sie sicher', 'bist du sicher', 'bestätigen', 'wirklich', 'nicht rückgängig', 'unwiderruflich',
    'endgültig', 'diese aktion',
  ],
};
