// Template storage-file: one uploaded file in a cloud drive. Result: the share link.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Cloudberry Drive', 'Satchel Files', 'Bramble Vault'], nav: ['My files', 'Shared with me', 'Recent', 'Starred', 'Trash'],
    h: 'File details', owner: 'Owner', size: 'Size', unit: 'KB', folder: 'Folder', folders: ['Contracts 2026', 'Scans', 'Household'], st: 'State',
    ladder: ['Uploading', 'Checking for viruses', 'Available'], neg: ['Upload failed', '{ref} could not be uploaded because it is larger than your remaining space.'], share: 'Share link',
    pend: 'Sharing is switched on; the share link is still being created.', queued: '{ref} is waiting to upload, with 3 files ahead of it.',
    space: 'Storage', spaceTxt: '13.2 GB of 15 GB used', tip: 'Files in Trash are deleted after 30 days.',
    E: { main: 'The file {ref} in the drive of {who}', res: 'A link for sharing {ref}', num: 'The file {ref} with a size of {num} KB', status: 'The upload of {ref} has completed' },
  },
  uk: {
    brands: ['Диск Морошка', 'Файли Торба', 'Сховище Ожина'], nav: ['Мої файли', 'Доступні мені', 'Нещодавні', 'Із зірочкою', 'Кошик'],
    h: 'Відомості про файл', owner: 'Власник', size: 'Розмір', unit: 'КБ', folder: 'Папка', folders: ['Договори 2026', 'Скани', 'Господарство'], st: 'Стан',
    ladder: ['Вивантаження', 'Перевірка на віруси', 'Доступний'], neg: ['Помилка вивантаження', 'Файл {ref} не вивантажено: він більший за вільне місце.'], share: 'Посилання для доступу',
    pend: 'Спільний доступ увімкнено; посилання ще створюється.', queued: 'Файл {ref} чекає на вивантаження, перед ним 3 файли.',
    space: 'Сховище', spaceTxt: 'Використано 13,2 ГБ з 15 ГБ', tip: 'Файли з кошика видаляються через 30 днів.',
    E: { main: 'Файл {ref} на диску (власник: {who})', res: 'Посилання, щоб поділитися файлом {ref}', num: 'Файл {ref} розміром {num} КБ', status: 'Вивантаження файлу {ref} завершилося' },
  },
  de: {
    brands: ['Moltebeere Drive', 'Ranzen Dateien', 'Brombeer Tresor'], nav: ['Meine Dateien', 'Für mich freigegeben', 'Zuletzt', 'Markiert', 'Papierkorb'],
    h: 'Dateidetails', owner: 'Eigentümer(in)', size: 'Größe', unit: 'KB', folder: 'Ordner', folders: ['Verträge 2026', 'Scans', 'Haushalt'], st: 'Zustand',
    ladder: ['Wird hochgeladen', 'Virenprüfung', 'Verfügbar'], neg: ['Hochladen fehlgeschlagen', '{ref} konnte nicht hochgeladen werden, weil die Datei größer als Ihr freier Speicher ist.'], share: 'Freigabelink',
    pend: 'Die Freigabe ist aktiviert; der Freigabelink wird noch erstellt.', queued: '{ref} wartet auf das Hochladen, 3 Dateien sind vorher dran.',
    space: 'Speicher', spaceTxt: '13,2 GB von 15 GB belegt', tip: 'Dateien im Papierkorb werden nach 30 Tagen gelöscht.',
    E: { main: 'Die Datei {ref} im Speicher von {who}', res: 'Ein Link zum Teilen von {ref}', num: 'Die Datei {ref} mit {num} KB', status: 'Das Hochladen von {ref} ist abgeschlossen' },
  },
  es: {
    brands: ['Unidad Mora', 'Archivos Morral', 'Cofre Zarza'], nav: ['Mis archivos', 'Compartidos conmigo', 'Recientes', 'Destacados', 'Papelera'],
    h: 'Detalles del archivo', owner: 'Propietario', size: 'Tamaño', unit: 'KB', folder: 'Carpeta', folders: ['Contratos 2026', 'Escaneos', 'Casa'], st: 'Estado',
    ladder: ['Subiendo', 'Comprobando virus', 'Disponible'], neg: ['Error al subir', '{ref} no se ha podido subir porque ocupa más que tu espacio libre.'], share: 'Enlace para compartir',
    pend: 'Compartir está activado; el enlace todavía se está creando.', queued: '{ref} espera para subirse; hay 3 archivos delante.',
    space: 'Almacenamiento', spaceTxt: '13,2 GB de 15 GB usados', tip: 'Los archivos de la papelera se eliminan a los 30 días.',
    E: { main: 'El archivo {ref} en la unidad de {who}', res: 'Un enlace para compartir {ref}', num: 'El archivo {ref} de {num} KB', status: 'La subida de {ref} ha terminado' },
  },
};

export const storageFile = {
  id: 'storage-file', kind: 'storage', langs: ['en', 'uk', 'de', 'es'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `scan-${41000 + r.int(58000)}.pdf`, spec: { type: 'count' }, max: 60000 });
    const v = c.v;
    const folder = rng.pick(v.folders);
    const code = Array.from({ length: 7 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[rng.int(31)]).join('');
    return {
      ...c, kind: 'storage', nav: v.nav, slug: 'drive', crumbs: [v.nav[0], folder], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${x.ref} - ${c.brand}`, at: (ref) => `/drive/file/${ref.replace('.pdf', '')}`, resText: `/s/${code}`, loadTitle: v.h,
      en: { thing: 'file', res: 'share link', num: 'file size' },
      main(x, ui) {
        const res = `<div class="card"><strong>${esc(v.share)}:</strong> ${ui.a(`/s/${code}`, `/s/${code}`)}</div>`;
        return `<h1>${esc(x.ref)}</h1><p class="muted">${esc(v.h)}</p>${rows([[v.owner, esc(x.who)], [v.size, `${esc(x.num)} ${esc(v.unit)}`], [v.folder, esc(folder)], [v.st, stageBadge(x)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: () => box(v.space, `<p>${esc(v.spaceTxt)}</p><p class="muted">${esc(v.tip)}</p>`),
    };
  },
};
