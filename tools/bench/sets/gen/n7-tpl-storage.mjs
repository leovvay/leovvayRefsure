// Template storage-upload: a cloud file storage folder view with an upload panel and a file search box.
// Categories: confirmation (upload complete), error (upload refused), results (file search), greeting.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { people } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Boxwell', 'Cloudcrate', 'Stowly'], nav: ['My files', 'Shared', 'Recent', 'Trash'],
    users: [['Nora', 'Nora Ellis'], ['Oscar', 'Oscar Brandt'], ['Petra', 'Petra Lunde'], ['Quinn', 'Quinn Adler']],
    h: 'Project Fieldnotes', crumbs: ['My files', 'Projects', 'Fieldnotes'], up: 'Upload files', drop: 'Drag files here or choose them from your computer.', choose: 'Choose files',
    files: ['site-survey-draft.docx', 'river-photos-0915.zip', 'budget-2026-v3.xlsx', 'interview-notes.pdf', 'map-overlay.png'], search: 'Search in this folder', ph: 'file name',
    side: ['Storage', '18.4 GB of 50 GB used', 'Upgrade storage', 'Manage devices'],
    ok: '{f} uploaded', neg: '{f} was not uploaded.', pending: 'Uploading {f}…', mention: 'Uploaded files are confirmed here when the transfer finishes.',
    e1: 'Upload failed: {f} is larger than the 2 GB file limit.', e2: 'Upload failed: a file named {f} already exists in this folder.',
    clear: 'Files checked. No problems found.', checking: 'Checking {f}…', emention: 'If a file cannot be uploaded, the reason is shown next to its name.',
    errSpec: 'an error saying the file is larger than the 2 GB limit',
    q: ['invoice', 'contract', 'logo'], rows: { invoice: ['invoice-0921.pdf · Finance', 'invoice-template.docx · Templates', 'invoices-q3.xlsx · Finance'], contract: ['contract-signed.pdf · Legal', 'contract-draft-v2.docx · Legal'], logo: ['logo-dark.svg · Brand', 'logo-light.png · Brand', 'logo-old.png · Archive'] },
  },
  es: {
    brands: ['Cajón', 'Nubebox', 'Guardalo'], nav: ['Mis archivos', 'Compartidos', 'Recientes', 'Papelera'],
    users: [['Lucía', 'Lucía Pardo'], ['Mateo', 'Mateo Ruiz'], ['Carmen', 'Carmen Soler'], ['Diego', 'Diego Navas']],
    h: 'Proyecto Cuaderno de campo', crumbs: ['Mis archivos', 'Proyectos', 'Cuaderno de campo'], up: 'Subir archivos', drop: 'Arrastra archivos aquí o elígelos en tu equipo.', choose: 'Elegir archivos',
    files: ['borrador-estudio-terreno.docx', 'fotos-rio-0915.zip', 'presupuesto-2026-v3.xlsx', 'notas-entrevistas.pdf', 'capa-mapa.png'], search: 'Buscar en esta carpeta', ph: 'nombre de archivo',
    side: ['Almacenamiento', '18,4 GB de 50 GB usados', 'Ampliar espacio', 'Gestionar dispositivos'],
    ok: '{f} subido', neg: '{f} no se ha subido.', pending: 'Subiendo {f}…', mention: 'Los archivos subidos se confirman aquí cuando termina la transferencia.',
    e1: 'Error al subir: {f} supera el límite de 2 GB por archivo.', e2: 'Error al subir: ya existe un archivo llamado {f} en esta carpeta.',
    clear: 'Archivos comprobados. No hay ningún problema.', checking: 'Comprobando {f}…', emention: 'Si un archivo no se puede subir, verás el motivo junto a su nombre.',
    errSpec: 'an error saying the file is larger than the 2 GB limit',
    q: ['factura', 'contrato', 'logotipo'], rows: { factura: ['factura-0921.pdf · Finanzas', 'plantilla-factura.docx · Plantillas', 'facturas-t3.xlsx · Finanzas'], contrato: ['contrato-firmado.pdf · Legal', 'borrador-contrato-v2.docx · Legal'], logotipo: ['logotipo-oscuro.svg · Marca', 'logotipo-claro.png · Marca', 'logotipo-antiguo.png · Archivo'] },
  },
};

export const storageUpload = {
  id: 'storage-upload', kind: 'storage', langs: ['en', 'es'], cats: ['confirmation', 'error', 'results', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const [f, f2, ...rest] = rng.shuffle(v.files);
    const sub = (t, x) => t.replaceAll('{f}', x);
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    return {
      kind: 'storage', brand, title: `${v.h} · ${brand}`, at: '/files/projects/fieldnotes', host: 'files', nav: v.nav, slug: 'files', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        const names = rest.slice(0, 3).map((x) => `<tr><td>${esc(x)}</td></tr>`).join('');
        return `<h1>${esc(v.h)}</h1>${slot}<div class="card"><h2>${esc(v.up)}</h2><p>${esc(v.drop)}</p>${ui.btn(v.choose, { pri: true })}</div><table><tbody>${names}</tbody></table>
<div class="card"><h2>${esc(v.search)}</h2><input type="search" value="" placeholder="${esc(v.ph)}"></div>`;
      },
      aside(ui) { return box(v.side[0], `<p>${esc(v.side[1])}</p>${list(v.side.slice(2).map((x) => ui.a(x, '/settings')))}`); },
      cats: {
        confirmation: { ok: sub(v.ok, f), wrong: sub(v.ok, f2), neg: sub(v.neg, f), pending: sub(v.pending, f), mention: v.mention, spec: `a confirmation that ${f} was uploaded` },
        error: { e1: sub(v.e1, f), e2: sub(v.e2, f), clear: v.clear, checking: sub(v.checking, f), mention: v.emention, spec: v.errSpec },
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
      },
    };
  },
};
