// Domains `currency` and `payment`: names in en|uk|de|es|pl, codes, aliases and paraphrases.
import { T } from './n8-lib.mjs';

const C = (v, names, code, alias, near = []) => ({ v, l: T(names), code, alias: alias ? T(alias) : undefined, near });

export const currency = {
  id: 'currency',
  label: T('Currency|Валюта|Währung|Moneda|Waluta'),
  concepts: [
    C('USD', 'US dollar|Долар США|US-Dollar|Dólar estadounidense|Dolar amerykański', ['USD'],
      'American dollar|американський долар|amerikanischer Dollar|dólar americano|dolar USA', ['AUD', 'CAD']),
    C('AUD', 'Australian dollar|Австралійський долар|Australischer Dollar|Dólar australiano|Dolar australijski', ['AUD'],
      'dollar of Australia|долар Австралії|Dollar Australiens|dólar de Australia|dolar Australii', ['USD', 'CAD']),
    C('CAD', 'Canadian dollar|Канадський долар|Kanadischer Dollar|Dólar canadiense|Dolar kanadyjski', ['CAD'],
      'dollar of Canada|долар Канади|Dollar Kanadas|dólar de Canadá|dolar Kanady', ['USD', 'AUD']),
    C('SEK', 'Swedish krona|Шведська крона|Schwedische Krone|Corona sueca|Korona szwedzka', ['SEK'],
      'crown of Sweden|крона Швеції|Krone Schwedens|corona de Suecia|korona Szwecji', ['NOK', 'DKK', 'CZK']),
    C('NOK', 'Norwegian krone|Норвезька крона|Norwegische Krone|Corona noruega|Korona norweska', ['NOK'],
      'crown of Norway|крона Норвегії|Krone Norwegens|corona de Noruega|korona Norwegii', ['SEK', 'DKK', 'CZK']),
    C('DKK', 'Danish krone|Данська крона|Dänische Krone|Corona danesa|Korona duńska', ['DKK'],
      'crown of Denmark|крона Данії|Krone Dänemarks|corona de Dinamarca|korona Danii', ['SEK', 'NOK', 'CZK']),
    C('CZK', 'Czech koruna|Чеська крона|Tschechische Krone|Corona checa|Korona czeska', ['CZK'],
      'crown of Czechia|крона Чехії|Krone Tschechiens|corona de Chequia|korona Czech', ['SEK', 'NOK', 'DKK']),
    C('EUR', 'Euro|Євро|Euro|Euro|Euro', ['EUR', '€']),
    C('GBP', 'Pound sterling|Фунт стерлінгів|Pfund Sterling|Libra esterlina|Funt szterling', ['GBP', '£']),
    C('UAH', 'Ukrainian hryvnia|Українська гривня|Ukrainische Hrywnja|Grivna ucraniana|Hrywna ukraińska', ['UAH', '₴']),
    C('PLN', 'Polish złoty|Польський злотий|Polnischer Złoty|Esloti polaco|Złoty polski', ['PLN', 'zł']),
    C('CHF', 'Swiss franc|Швейцарський франк|Schweizer Franken|Franco suizo|Frank szwajcarski', ['CHF']),
    C('JPY', 'Japanese yen|Японська єна|Japanischer Yen|Yen japonés|Jen japoński', ['JPY']),
    C('INR', 'Indian rupee|Індійська рупія|Indische Rupie|Rupia india|Rupia indyjska', ['INR', '₹']),
    C('TRY', 'Turkish lira|Турецька ліра|Türkische Lira|Lira turca|Lira turecka', ['TRY', '₺']),
    C('HUF', 'Hungarian forint|Угорський форинт|Ungarischer Forint|Forinto húngaro|Forint węgierski', ['HUF']),
    C('RON', 'Romanian leu|Румунський лей|Rumänischer Leu|Leu rumano|Lej rumuński', ['RON']),
    C('MDL', 'Moldovan leu|Молдовський лей|Moldauischer Leu|Leu moldavo|Lej mołdawski', ['MDL'],
      'leu of Moldova|лей Молдови|Leu der Republik Moldau|leu de Moldavia|lej Mołdawii', ['RON']),
  ],
};
// The two lei are fold-near too: a Moldovan want with only the Romanian leu listed is a near miss.
currency.concepts.find((c) => c.v === 'RON').near = ['MDL'];
currency.concepts.find((c) => c.v === 'RON').alias = T('leu of Romania|лей Румунії|Leu Rumäniens|leu de Rumanía|lej Rumunii');

const P = (v, names, desc) => ({ v, l: T(names), desc: T(desc), near: [] });

export const payment = {
  id: 'payment',
  label: T('Payment method|Спосіб оплати|Zahlungsart|Método de pago|Metoda płatności'),
  concepts: [
    P('card', 'Credit or debit card|Банківська картка|Kredit- oder Debitkarte|Tarjeta de crédito o débito|Karta płatnicza',
      'pay right away with the card my bank issued to me|оплатити одразу карткою, яку мені видав банк|sofort mit der Karte zahlen, die mir meine Bank ausgestellt hat|pagar ahora mismo con la tarjeta que me dio mi banco|zapłacić od razu kartą wydaną mi przez bank'),
    P('cod', 'Cash on delivery|Оплата при отриманні|Nachnahme|Contra reembolso|Płatność przy odbiorze',
      'pay the courier in cash when the parcel arrives|заплатити кур’єру готівкою, коли привезуть посилку|dem Boten bar zahlen, wenn das Paket ankommt|pagar en efectivo al repartidor cuando llegue el paquete|zapłacić kurierowi gotówką, gdy przyjdzie paczka'),
    P('transfer', 'Bank transfer|Банківський переказ|Überweisung|Transferencia bancaria|Przelew bankowy',
      'pay in advance by sending the money from my own bank account|оплатити наперед, надіславши гроші зі свого банківського рахунку|im Voraus zahlen, indem ich das Geld von meinem Bankkonto schicke|pagar por adelantado enviando el dinero desde mi cuenta bancaria|zapłacić z góry, wysyłając pieniądze z własnego konta bankowego'),
    P('instal', 'Monthly instalments|Оплата частинами|Ratenzahlung|Pago a plazos|Raty miesięczne',
      'split the price into several smaller monthly payments|розбити ціну на кілька менших щомісячних платежів|den Preis in mehrere kleinere Monatsbeträge aufteilen|dividir el precio en varios pagos mensuales más pequeños|rozłożyć cenę na kilka mniejszych miesięcznych płatności'),
    P('voucher', 'Gift card or voucher|Подарунковий сертифікат|Gutschein oder Geschenkkarte|Tarjeta regalo o vale|Karta podarunkowa lub bon',
      'use the prepaid present code my friend gave me|використати передплачений подарунковий код від друга|den vorausbezahlten Geschenkcode von meiner Freundin einlösen|usar el código regalo prepagado que me dio mi amiga|użyć przedpłaconego kodu prezentowego od znajomej'),
    P('store', 'Pay at the pickup point|Оплата в пункті видачі|Bezahlung in der Abholstelle|Pago en el punto de recogida|Płatność w punkcie odbioru',
      'pay at the counter when I collect the order myself|заплатити на касі, коли сам заберу замовлення|an der Theke zahlen, wenn ich die Bestellung selbst abhole|pagar en el mostrador cuando recoja yo el pedido|zapłacić przy ladzie, kiedy sam odbiorę zamówienie'),
  ],
};
