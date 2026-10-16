// Template docs-release: release notes on a product documentation site. Result: the migration guide.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Quillstack Docs', 'Fernpath SDK', 'Orrery Data Platform'], nav: ['Guides', 'API reference', 'Release notes', 'Tutorials', 'Community'],
    h: 'Release notes', ver: 'Version', date: 'Release date', owner: 'Maintainer', ladder: ['Draft', 'In review', 'Published'],
    neg: ['Withdrawn', 'Version {ref} was withdrawn and is not available for download. These notes are kept for reference only.'],
    mig: 'Migration guide', migText: 'Rename the client option timeout to requestTimeout and rebuild your cache.', changes: ['Faster cold start for large projects', 'New export to Parquet', 'Fixed a crash when a path has spaces'],
    pend: 'The migration guide for version {ref} is still being written.', queued: 'The notes for version {ref} are queued for the next documentation build.',
    toc: 'On this page', tocs: ['Highlights', 'Breaking changes', 'Fixes'],
    E: { main: 'Release notes for version {ref}', res: 'A migration guide for version {ref}', num: 'Version {ref} released on {num}', status: 'The notes for version {ref} are live on the site' },
  },
  uk: {
    brands: ['Документація Перо', 'Папороть SDK', 'Платформа даних Оррері'], nav: ['Посібники', 'Довідник API', 'Що нового', 'Уроки', 'Спільнота'],
    h: 'Примітки до випуску', ver: 'Версія', date: 'Дата випуску', owner: 'Супровідник', ladder: ['Чернетка', 'На рецензії', 'Опубліковано'],
    neg: ['Відкликано', 'Версію {ref} відкликано, її не можна завантажити. Ці примітки збережено лише для довідки.'],
    mig: 'Посібник з міграції', migText: 'Перейменуйте параметр клієнта timeout на requestTimeout і перебудуйте кеш.', changes: ['Швидший холодний старт великих проєктів', 'Новий експорт у Parquet', 'Виправлено збій, коли шлях містить пробіли'],
    pend: 'Посібник з міграції для версії {ref} ще пишеться.', queued: 'Примітки до версії {ref} стоять у черзі на наступну збірку документації.',
    toc: 'На цій сторінці', tocs: ['Головне', 'Несумісні зміни', 'Виправлення'],
    E: { main: 'Примітки до випуску версії {ref}', res: 'Посібник з міграції на версію {ref}', num: 'Версія {ref}, випущена {num}', status: 'Примітки до версії {ref} вже на сайті' },
  },
  de: {
    brands: ['Federkiel Docs', 'Farnweg SDK', 'Orrery Datenplattform'], nav: ['Anleitungen', 'API-Referenz', 'Versionshinweise', 'Tutorials', 'Community'],
    h: 'Versionshinweise', ver: 'Version', date: 'Veröffentlicht am', owner: 'Maintainer', ladder: ['Entwurf', 'Im Review', 'Veröffentlicht'],
    neg: ['Zurückgezogen', 'Version {ref} wurde zurückgezogen und steht nicht zum Download bereit. Diese Hinweise bleiben nur zur Information.'],
    mig: 'Migrationsleitfaden', migText: 'Benennen Sie die Client-Option timeout in requestTimeout um und bauen Sie den Cache neu.', changes: ['Schnellerer Kaltstart bei großen Projekten', 'Neuer Export nach Parquet', 'Absturz bei Pfaden mit Leerzeichen behoben'],
    pend: 'Der Migrationsleitfaden für Version {ref} wird noch geschrieben.', queued: 'Die Hinweise zu Version {ref} warten auf den nächsten Build der Dokumentation.',
    toc: 'Auf dieser Seite', tocs: ['Highlights', 'Inkompatible Änderungen', 'Fehlerbehebungen'],
    E: { main: 'Versionshinweise zu Version {ref}', res: 'Ein Migrationsleitfaden für Version {ref}', num: 'Version {ref}, veröffentlicht am {num}', status: 'Die Hinweise zu Version {ref} sind online' },
  },
  es: {
    brands: ['Pluma Docs', 'Helecho SDK', 'Plataforma de datos Orrery'], nav: ['Guías', 'Referencia API', 'Novedades', 'Tutoriales', 'Comunidad'],
    h: 'Notas de la versión', ver: 'Versión', date: 'Fecha de publicación', owner: 'Responsable', ladder: ['Borrador', 'En revisión', 'Publicado'],
    neg: ['Retirada', 'La versión {ref} se ha retirado y no se puede descargar. Estas notas se conservan solo como referencia.'],
    mig: 'Guía de migración', migText: 'Cambia la opción del cliente timeout por requestTimeout y reconstruye la caché.', changes: ['Arranque en frío más rápido en proyectos grandes', 'Nueva exportación a Parquet', 'Corregido un fallo con rutas que tienen espacios'],
    pend: 'La guía de migración de la versión {ref} todavía se está escribiendo.', queued: 'Las notas de la versión {ref} están en cola para la próxima compilación de la documentación.',
    toc: 'En esta página', tocs: ['Destacado', 'Cambios incompatibles', 'Correcciones'],
    E: { main: 'Las notas de la versión {ref}', res: 'Una guía de migración para la versión {ref}', num: 'La versión {ref} publicada el {num}', status: 'Las notas de la versión {ref} ya están publicadas en el sitio' },
  },
};

export const docsRelease = {
  id: 'docs-release', kind: 'docs', langs: ['en', 'uk', 'de', 'es'],
  make(rng, lang) {
    const ver = (r) => {
      const b = 1 + r.int(8);
      return `${2 + r.int(6)}.${b}${(b + 1 + r.int(8)) % 10}.${r.int(10)}`;
    };
    const c = common(V, lang, rng, { ref: ver, spec: { type: 'date' } });
    const v = c.v;
    const prev = `${c.f.ref.split('.')[0]}.0.${1 + rng.int(9)}`;
    return {
      ...c, kind: 'docs', nav: v.nav, slug: 'docs', crumbs: [v.nav[0], v.nav[2]], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.h} ${x.ref} — ${c.brand}`, at: (ref) => `/docs/releases/${ref}`, resText: v.migText, loadTitle: v.h,
      en: { thing: 'version', res: 'migration guide', num: 'release date' },
      main(x, ui) {
        const res = `<h2>${esc(v.mig)}</h2><p>${esc(v.migText)}</p>`;
        return `<h1>${esc(v.h)}: ${esc(v.ver)} ${esc(x.ref)}</h1><p>${stageBadge(x)}</p>${rows([[v.date, esc(x.num)], [v.owner, esc(x.who)]])}
${list(v.changes.map(esc))}${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: (x, ui) => box(v.toc, list(v.tocs.map((t) => ui.a(t, '#')))) + box(v.nav[2], `<p>${ui.a(prev, `/docs/releases/${prev}`)}</p>`),
    };
  },
};
