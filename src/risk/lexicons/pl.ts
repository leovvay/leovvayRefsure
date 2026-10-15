import type { LanguageLexicon } from './language-lexicon';

const cancelVerbs = ['anuluj', 'anulować', 'zrezygnuj', 'wypowiedz'];

export const PL: LanguageLexicon = {
  lang: 'pl',
  money: [
    'zapłać', 'zapłać teraz', 'płatność', 'kup', 'kup teraz', 'kupuję', 'zamów', 'zamawiam', 'zamawiam i płacę',
    'do kasy', 'doładuj', 'numer karty', 'przelew', 'wpłać',
  ],
  irreversible: [
    'usuń', 'usunąć', 'wyślij', 'wysłać', 'opublikuj', 'odwołaj', 'cofnij uprawnienia', 'trwale', 'zamknij konto',
    'dezaktywuj', 'wypisz się', 'nieodwracalnie',
  ],
  auth: [
    'zaloguj', 'zaloguj się', 'logowanie', 'zarejestruj się', 'hasło', 'dwuetapowa', 'uwierzytelnianie',
    'autoryzuj', 'przełącz konto', 'kod weryfikacyjny', 'kod jednorazowy', 'przyznaj dostęp',
  ],
  consent: [
    'akceptuj', 'akceptuję', 'zaakceptuj', 'zaakceptuj wszystkie', 'zgadzam się', 'zgoda', 'zezwól',
    'zezwól na wszystkie', 'zezwól na cookies', 'subskrybuj',
  ],
  dismissClose: [
    'zamknij', 'odrzuć', 'odrzuć wszystkie', 'nie, dziękuję', 'nie dziękuję', 'później', 'nie teraz', 'pomiń',
    'ukryj', '×',
  ],
  dismissVeto: [
    'akceptuj', 'zgadzam się', 'zezwól', 'subskrybuj', 'kup', 'wersja próbna', 'włącz', 'ulepsz', 'zarządzaj',
    'ustawienia', 'preferencje', 'dostosuj',
  ],
  cancelContext: ['subskrypcję', 'subskrypcja', 'zamówienie', 'konto', 'rezerwację', 'rezerwacja', 'abonament'],
  cancelVerbs,
  cancelWords: [...cancelVerbs, 'nie', 'wstecz'],
  confirmCue: [
    'czy na pewno', 'jesteś pewien', 'potwierdź', 'nie można cofnąć', 'nieodwracalnie', 'trwale', 'ta operacja',
    'ta czynność',
  ],
};
