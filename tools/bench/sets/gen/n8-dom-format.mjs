// Domains whose wants differ from the option by format: `timeslot`, `guests`, `weight`, `rows`, plus `version`
// (semver look-alikes). `fmt` holds the wants per page language; 24-hour clocks except en (12-hour).
import { T } from './n8-lib.mjs';

const UK_GEN = ['', 'першу', 'другу', 'третю', 'четверту', 'п’яту', 'шосту', 'сьому', 'восьму', 'дев’яту', 'десяту', 'одинадцяту', 'дванадцяту'];
const UK_LOC = ['', 'першій', 'другій', 'третій', 'четвертій', 'п’ятій', 'шостій', 'сьомій', 'восьмій', 'дев’ятій', 'десятій', 'одинадцятій', 'дванадцятій'];
const PL_ORD = ['', 'pierwszej', 'drugiej', 'trzeciej', 'czwartej', 'piątej', 'szóstej', 'siódmej', 'ósmej', 'dziewiątej', 'dziesiątej', 'jedenastej', 'dwunastej'];
const DE_NUM = ['', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
const ES_NUM = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];
const EN_NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const PART = { en: ['in the morning', 'in the afternoon', 'in the evening'], uk: ['ранку', 'дня', 'вечора'], de: ['morgens', 'nachmittags', 'abends'], es: ['de la mañana', 'de la tarde', 'de la tarde'], pl: ['rano', 'po południu', 'wieczorem'] };

const hh = (h, m) => `${String(h).padStart(2, '0')}:${m}`;
const ampm = (h, m) => `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;

/** A slot spoken in words: "half past six in the evening", "halb sieben abends" (next hour), "пів на сьому вечора". */
function spoken(h, m) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const nx = (h12 % 12) + 1;
  const p = h < 12 ? 0 : h < 17 ? 1 : 2;
  const half = m === '30';
  const art = h12 === 1 ? 'la' : 'las';
  return {
    en: half ? `half past ${EN_NUM[h12]} ${PART.en[p]}` : `${EN_NUM[h12]} o’clock ${PART.en[p]}`,
    uk: half ? `пів на ${UK_GEN[nx]} ${PART.uk[p]}` : `о ${UK_LOC[h12]} ${PART.uk[p]}`,
    de: half ? `halb ${DE_NUM[nx]} ${PART.de[p]}` : `um ${DE_NUM[h12]} Uhr ${PART.de[p]}`,
    es: half ? `${art} ${ES_NUM[h12]} y media ${PART.es[p]}` : `${art} ${ES_NUM[h12]} en punto ${PART.es[p]}`,
    pl: half ? `wpół do ${PL_ORD[nx]} ${PART.pl[p]}` : `o ${PL_ORD[h12]} ${PART.pl[p]}`,
  };
}

const HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19];
const slots = HOURS.flatMap((h) => ['00', '30'].map((m) => [h, m]));

export const timeslot = {
  id: 'timeslot',
  label: T('Time|Час|Uhrzeit|Hora|Godzina'),
  concepts: slots.map(([h, m], k) => {
    const v = hh(h, m);
    const words = spoken(h, m);
    const l = { en: ampm(h, m), uk: v, de: v, es: v, pl: v };
    const fmt = { en: [v, words.en], uk: [words.uk, ampm(h, m)], de: [words.de, `${v} Uhr`], es: [words.es, ampm(h, m)], pl: [words.pl, ampm(h, m)] };
    const near = [slots[k - 1], slots[k + 1]].filter(Boolean).map(([a, b]) => hh(a, b));
    return { v, l, fmt, near, half: m === '30' };
  }),
};

const G = (v, names, fmt) => ({ v, l: T(names), fmt: Object.fromEntries(Object.entries(T(fmt)).map(([k, s]) => [k, s.split(' / ')])), near: [] });

export const guests = {
  id: 'guests',
  label: T('Guests|Гості|Gäste|Huéspedes|Goście'),
  concepts: [
    G('1a', '1 adult|1 дорослий|1 Erwachsener|1 adulto|1 dorosły', 'just one grown-up / one person, no kids|лише одна доросла людина / одна особа, без дітей|nur ein Erwachsener / eine Person, keine Kinder|solo un adulto / una persona, sin niños|tylko jedna dorosła osoba / jedna osoba, bez dzieci'),
    G('2a', '2 adults|2 дорослих|2 Erwachsene|2 adultos|2 dorosłych', 'two grown-ups / a couple, no children|двоє дорослих / пара, без дітей|zwei Erwachsene / ein Paar ohne Kinder|dos adultos / una pareja, sin niños|dwoje dorosłych / para, bez dzieci'),
    G('3a', '3 adults|3 дорослих|3 Erwachsene|3 adultos|3 dorosłych', 'three grown-ups, no kids|троє дорослих, без дітей|drei Erwachsene, keine Kinder|tres adultos, sin niños|troje dorosłych, bez dzieci'),
    G('1a1c', '1 adult, 1 child|1 дорослий, 1 дитина|1 Erwachsener, 1 Kind|1 adulto, 1 niño|1 dorosły, 1 dziecko', 'one parent with one kid|один із батьків з однією дитиною|ein Elternteil mit einem Kind|un padre con un hijo|jeden rodzic z jednym dzieckiem'),
    G('2a1c', '2 adults, 1 child|2 дорослих, 1 дитина|2 Erwachsene, 1 Kind|2 adultos, 1 niño|2 dorosłych, 1 dziecko', 'two grown-ups and a kid / 2 ad. + 1 ch.|двоє дорослих і дитина / 2 дор. + 1 дит.|zwei Erwachsene und ein Kind / 2 Erw. + 1 Ki.|dos adultos y un niño / 2 ad. + 1 niño|dwoje dorosłych i dziecko / 2 dor. + 1 dz.'),
    G('2a2c', '2 adults, 2 children|2 дорослих, 2 дитини|2 Erwachsene, 2 Kinder|2 adultos, 2 niños|2 dorosłych, 2 dzieci', 'a family of four, two of them kids / 2 ad. + 2 ch.|сім’я з чотирьох, двоє з них діти / 2 дор. + 2 дит.|eine vierköpfige Familie, zwei davon Kinder / 2 Erw. + 2 Ki.|una familia de cuatro, dos de ellos niños / 2 ad. + 2 niños|czteroosobowa rodzina, w tym dwoje dzieci / 2 dor. + 2 dz.'),
  ],
};

export const weight = {
  id: 'weight',
  label: T('Pack size|Фасування|Packungsgröße|Tamaño del paquete|Wielkość opakowania'),
  concepts: [
    G('100', '100 g|100 г|100 g|100 g|100 g', 'a tenth of a kilo / 0.1 kg|десята частина кілограма / 0,1 кг|ein Zehntelkilo / 0,1 kg|una décima de kilo / 0,1 kg|jedna dziesiąta kilograma / 0,1 kg'),
    G('250', '250 g|250 г|250 g|250 g|250 g', 'a quarter of a kilo / 0.25 kg|чверть кілограма / 0,25 кг|ein Viertelkilo / 0,25 kg|un cuarto de kilo / 0,25 kg|ćwierć kilograma / 0,25 kg'),
    G('500', '500 g|500 г|500 g|500 g|500 g', 'half a kilo / 0.5 kg|пів кілограма / 0,5 кг|ein halbes Kilo / 0,5 kg|medio kilo / 0,5 kg|pół kilograma / 0,5 kg'),
    G('1000', '1 kg|1 кг|1 kg|1 kg|1 kg', 'a full kilogram / 1000 g|цілий кілограм / 1000 г|ein ganzes Kilo / 1000 g|un kilo entero / 1000 g|cały kilogram / 1000 g'),
    G('2000', '2 kg|2 кг|2 kg|2 kg|2 kg', 'two kilos / 2000 g|два кілограми / 2000 г|zwei Kilo / 2000 g|dos kilos / 2000 g|dwa kilogramy / 2000 g'),
  ],
};

export const rows = {
  id: 'rows',
  label: T('Rows per page|Рядків на сторінці|Zeilen pro Seite|Filas por página|Wierszy na stronie'),
  concepts: [
    G('10', '10 per page|10 на сторінці|10 pro Seite|10 por página|10 na stronę', 'ten at a time / 10 rows|по десять / 10 рядків|zehn auf einmal / 10 Zeilen|de diez en diez / 10 filas|po dziesięć / 10 wierszy'),
    G('25', '25 per page|25 на сторінці|25 pro Seite|25 por página|25 na stronę', 'twenty-five at a time / 25 rows|по двадцять п’ять / 25 рядків|fünfundzwanzig auf einmal / 25 Zeilen|de veinticinco en veinticinco / 25 filas|po dwadzieścia pięć / 25 wierszy'),
    G('50', '50 per page|50 на сторінці|50 pro Seite|50 por página|50 na stronę', 'fifty rows at once / half a hundred|п’ятдесят рядків за раз / пів сотні|fünfzig Zeilen auf einmal / ein halbes Hundert|cincuenta filas de una vez / medio centenar|pięćdziesiąt wierszy naraz / pół setki'),
    G('100', '100 per page|100 на сторінці|100 pro Seite|100 por página|100 na stronę', 'a hundred rows at once / 100 rows|сто рядків за раз / 100 рядків|hundert Zeilen auf einmal / 100 Zeilen|cien filas de una vez / 100 filas|sto wierszy naraz / 100 wierszy'),
  ],
};

const latest = T(' (latest)| (найновіша)| (aktuell)| (última)| (najnowsza)');
const legacy = T(' (legacy)| (застаріла)| (veraltet)| (heredada)| (przestarzała)');
const VERS = [['4.1', latest], ['4.0'], ['3.12'], ['3.2'], ['3.1'], ['2.10'], ['2.1'], ['1.9', legacy]];
const VNEAR = { '3.2': ['3.12', '3.1'], '3.12': ['3.2', '3.1'], '2.1': ['2.10'], '2.10': ['2.1'] };
const vword = T('version|версія|Version|versión|wersja');

export const version = {
  id: 'version',
  label: T('Version|Версія|Version|Versión|Wersja'),
  concepts: VERS.map(([v, tag]) => ({
    v, l: Object.fromEntries(Object.keys(vword).map((k) => [k, `${v}.x${tag ? tag[k] : ''}`])),
    alias: Object.fromEntries(Object.keys(vword).map((k) => [k, `${vword[k]} ${v}`])), near: VNEAR[v] ?? [],
  })),
};
