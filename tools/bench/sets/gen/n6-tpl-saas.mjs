// Template saas-export: a data export job in a SaaS admin console. Result: the CSV download link.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Tallyroom', 'Brightmeadow CRM', 'Pinecrest Desk'], nav: ['Dashboard', 'Contacts', 'Reports', 'Integrations', 'Settings'],
    h: 'Data exports', job: 'Export', by: 'Requested by', size: 'Rows', unit: 'rows', src: 'Source', srcs: ['All contacts', 'Closed deals 2026', 'Support conversations'], ladder: ['Queued', 'Running', 'Ready'],
    neg: ['Failed', 'Export {ref} failed: the source table could not be read. No file was created.'], dl: 'Download CSV',
    pend: 'The file is built; its download link is being signed and will appear here shortly.', queued: 'Export {ref} is queued behind 3 other jobs on your workspace.',
    keep: 'Export files are kept for 7 days.', plan: 'Plan usage', usage: '18 of 25 exports this month',
    E: { main: 'The data export {ref} requested by {who}', res: 'A download link for export {ref}', num: 'Export {ref} with {num} rows', status: 'Export {ref} has finished' },
  },
  uk: {
    brands: ['Облікова Кімната', 'Ясна Галявина CRM', 'Сосновий Деск'], nav: ['Огляд', 'Контакти', 'Звіти', 'Інтеграції', 'Налаштування'],
    h: 'Експорт даних', job: 'Експорт', by: 'Запит від', size: 'Рядків', unit: 'рядків', src: 'Джерело', srcs: ['Усі контакти', 'Закриті угоди 2026', 'Розмови підтримки'], ladder: ['У черзі', 'Виконується', 'Готово'],
    neg: ['Помилка', 'Експорт {ref} не вдався: не вдалося прочитати таблицю-джерело. Файл не створено.'], dl: 'Завантажити CSV',
    pend: 'Файл зібрано; посилання для завантаження підписується і незабаром з’явиться тут.', queued: 'Експорт {ref} стоїть у черзі за 3 іншими завданнями.',
    keep: 'Файли експорту зберігаються 7 днів.', plan: 'Використання тарифу', usage: '18 з 25 експортів цього місяця',
    E: { main: 'Експорт даних {ref}, який замовив(ла) {who}', res: 'Посилання для завантаження експорту {ref}', num: 'Експорт {ref} на {num} рядків', status: 'Експорт {ref} завершився' },
  },
  de: {
    brands: ['Zählwerk', 'Hellwiese CRM', 'Kieferdesk'], nav: ['Übersicht', 'Kontakte', 'Berichte', 'Integrationen', 'Einstellungen'],
    h: 'Datenexporte', job: 'Export', by: 'Angefordert von', size: 'Zeilen', unit: 'Zeilen', src: 'Quelle', srcs: ['Alle Kontakte', 'Abgeschlossene Deals 2026', 'Support-Gespräche'], ladder: ['In Warteschlange', 'Läuft', 'Fertig'],
    neg: ['Fehlgeschlagen', 'Export {ref} ist fehlgeschlagen: Die Quelltabelle konnte nicht gelesen werden. Es wurde keine Datei erstellt.'], dl: 'CSV herunterladen',
    pend: 'Die Datei ist erstellt; der Download-Link wird signiert und erscheint gleich hier.', queued: 'Export {ref} wartet hinter 3 anderen Aufträgen in der Warteschlange.',
    keep: 'Exportdateien werden 7 Tage aufbewahrt.', plan: 'Tarifnutzung', usage: '18 von 25 Exporten in diesem Monat',
    E: { main: 'Der Datenexport {ref}, angefordert von {who}', res: 'Ein Download-Link für Export {ref}', num: 'Export {ref} mit {num} Zeilen', status: 'Export {ref} ist abgeschlossen' },
  },
  es: {
    brands: ['Cuadrante', 'Pradera Clara CRM', 'Pinar Desk'], nav: ['Panel', 'Contactos', 'Informes', 'Integraciones', 'Ajustes'],
    h: 'Exportaciones de datos', job: 'Exportación', by: 'Solicitada por', size: 'Filas', unit: 'filas', src: 'Origen', srcs: ['Todos los contactos', 'Ventas cerradas 2026', 'Conversaciones de soporte'], ladder: ['En cola', 'En curso', 'Lista'],
    neg: ['Error', 'La exportación {ref} ha fallado: no se pudo leer la tabla de origen. No se creó ningún archivo.'], dl: 'Descargar CSV',
    pend: 'El archivo está generado; el enlace de descarga se está firmando y aparecerá aquí enseguida.', queued: 'La exportación {ref} está en cola detrás de otros 3 trabajos.',
    keep: 'Los archivos se conservan 7 días.', plan: 'Uso del plan', usage: '18 de 25 exportaciones este mes',
    E: { main: 'La exportación de datos {ref} solicitada por {who}', res: 'Un enlace de descarga para la exportación {ref}', num: 'La exportación {ref} con {num} filas', status: 'La exportación {ref} ha terminado' },
  },
};

export const saasExport = {
  id: 'saas-export', kind: 'saas', langs: ['en', 'uk', 'de', 'es'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `EXP-${3100 + r.int(6800)}`, spec: { type: 'count' }, max: 90000 });
    const v = c.v;
    const src = rng.pick(v.srcs);
    const older = [`EXP-${1000 + rng.int(2000)}`, `EXP-${1000 + rng.int(2000)}`];
    return {
      ...c, kind: 'saas', nav: v.nav, slug: 'app', crumbs: [v.nav[4], v.h], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.job} ${x.ref} · ${v.h} · ${c.brand}`, at: (ref) => `/settings/exports/${ref.toLowerCase()}`, resText: v.dl, loadTitle: v.h,
      en: { thing: 'export', res: 'download link', num: 'row count' },
      main(x, ui) {
        const res = `<p>${ui.btn(v.dl, { pri: true })} <span class="muted">${esc(x.ref.toLowerCase())}.csv</span></p>`;
        return `<h1>${esc(v.job)} ${esc(x.ref)}</h1><p>${stageBadge(x)}</p>${rows([[v.src, esc(src)], [v.by, esc(x.who)], [v.size, `${esc(x.num)} ${esc(v.unit)}`]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}<p class="muted">${esc(v.keep)}</p>`;
      },
      aside: (x, ui) => box(v.h, list(older.map((o) => `${ui.a(o, `/settings/exports/${o.toLowerCase()}`)} · ${esc(v.ladder[2])}`))) + box(v.plan, `<p>${esc(v.usage)}</p>`),
    };
  },
};
