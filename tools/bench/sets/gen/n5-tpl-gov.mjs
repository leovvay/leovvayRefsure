// Template gov-permit: a council "check your answers" page for a resident parking permit; the step submits it.
// Wrong item: another draft application (a visitor permit) is submitted instead. Invalid: a missing answer.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Dunmere Borough Council', 'Fenwick District Council', 'Lowther City Council'], nav: ['Services', 'Parking', 'Bins and recycling', 'Council tax', 'Contact'],
    users: ['Mara Quint', 'Owen Strick', 'Priya Calder'], streets: ['3 Mill Row', '14 Quarry Lane', '27 Harbour Terrace'],
    h: 'Check your answers', kind: 'Resident parking permit', other: 'Visitor parking permit (20 days)', rows: ['Applicant', 'Address', 'Vehicle registration', 'Permit zone'],
    decl: 'By submitting this application you confirm the information is correct.', submit: 'Accept and submit', change: 'Change', apps: 'Your applications', draft: 'Draft', sent: 'Submitted',
    ok: 'Application submitted. Reference {r}', bad: 'Visitor parking permit application submitted. Reference {r}', invalid: 'Upload proof of address (a council tax bill or tenancy agreement) before you submit',
    errHead: 'There is a problem', intent: 'submit the resident parking permit application for zone {z}', confirm: 'Submit your resident parking permit application for zone {z}?',
    cTitle: 'Application complete', cBody: 'Your reference number is {r}. We have sent a confirmation email. Decisions usually take 5 working days.', help: 'Permits cost £56 a year. You can pay after approval.',
  },
  uk: {
    brands: ['Липівська міська рада', 'Надбузька громада', 'Вербівська селищна рада'], nav: ['Послуги', 'Паркування', 'Відходи', 'Податки', 'Контакти'],
    users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'], streets: ['вул. Млинова, 3', 'вул. Кар’єрна, 14', 'вул. Портова, 27'],
    h: 'Перевірте відповіді', kind: 'Дозвіл на паркування для мешканців', other: 'Гостьовий дозвіл на паркування (20 днів)', rows: ['Заявник', 'Адреса', 'Номерний знак', 'Зона дозволу'],
    decl: 'Подаючи заяву, ви підтверджуєте, що відомості правильні.', submit: 'Погодитися і подати', change: 'Змінити', apps: 'Ваші заяви', draft: 'Чернетка', sent: 'Подано',
    ok: 'Заяву подано. Номер {r}', bad: 'Заяву на гостьовий дозвіл подано. Номер {r}', invalid: 'Завантажте підтвердження адреси (рахунок за комунальні послуги або договір оренди), перш ніж подавати заяву',
    errHead: 'Виникла проблема', intent: 'подати заяву на дозвіл на паркування для мешканців у зоні {z}', confirm: 'Подати заяву на дозвіл для мешканців у зоні {z}?',
    cTitle: 'Заяву прийнято', cBody: 'Номер вашої заяви {r}. Ми надіслали підтвердження на пошту. Рішення зазвичай ухвалюють за 5 робочих днів.', help: 'Дозвіл коштує 1 200 ₴ на рік. Сплатити можна після схвалення.',
  },
  es: {
    brands: ['Ayuntamiento de Valdeloma', 'Concello de Ribasar', 'Ayuntamiento de Torrebrezo'], nav: ['Trámites', 'Aparcamiento', 'Residuos', 'Impuestos', 'Contacto'],
    users: ['Lucía Varela', 'Diego Montaño', 'Carmen Ibarra'], streets: ['C/ Molino, 3', 'C/ Cantera, 14', 'Av. del Puerto, 27'],
    h: 'Revisa tus respuestas', kind: 'Tarjeta de aparcamiento para residentes', other: 'Tarjeta de aparcamiento para visitas (20 días)', rows: ['Solicitante', 'Dirección', 'Matrícula', 'Zona'],
    decl: 'Al enviar esta solicitud confirmas que los datos son correctos.', submit: 'Aceptar y enviar', change: 'Cambiar', apps: 'Tus solicitudes', draft: 'Borrador', sent: 'Enviada',
    ok: 'Solicitud enviada. Referencia {r}', bad: 'Solicitud de tarjeta para visitas enviada. Referencia {r}', invalid: 'Adjunta un justificante de domicilio (recibo o contrato de alquiler) antes de enviar',
    errHead: 'Hay un problema', intent: 'enviar la solicitud de tarjeta de residente para la zona {z}', confirm: '¿Enviar la solicitud de tarjeta de residente para la zona {z}?',
    cTitle: 'Solicitud completada', cBody: 'Tu número de referencia es {r}. Te hemos enviado un correo de confirmación. La resolución suele tardar 5 días hábiles.', help: 'La tarjeta cuesta 48 € al año. Puedes pagar tras la aprobación.',
  },
};

export const govPermit = {
  id: 'gov-permit', kind: 'gov', langs: ['en', 'uk', 'es'],
  make(rng, lang, il) {
    const v = V[lang];
    const z = `${'ABCDEFGH'[rng.int(8)]}${1 + rng.int(4)}`;
    const reg = `${'KLMNPRS'[rng.int(7)]}${'ABCDEFG'[rng.int(7)]}${10 + rng.int(80)} ${'XYZTUV'[rng.int(6)]}${'ABCDEF'[rng.int(6)]}${'HJKLMN'[rng.int(6)]}`;
    const user = rng.pick(v.users);
    const street = rng.pick(v.streets);
    const r = `PRK-${100000 + rng.int(899999)}`;
    const brand = rng.pick(v.brands);
    const vars = { z, r };
    const status = (state) => [[v.kind, state === 'done' ? `${v.sent} · ${r}` : v.draft], [v.other, state === 'wrong' ? `${v.sent} · ${r}` : v.draft]];
    return {
      kind: 'gov', brand, title: `${v.h} – ${v.kind} – ${brand}`, at: '/parking/permits/resident/check', nav: v.nav, slug: 'gov', user,
      crumbs: [v.nav[0], v.nav[1], v.kind], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const vals = [user, street, reg, z];
        const sum = state === 'invalid' ? `<div class="errsum" role="alert"><h2>${esc(v.errHead)}</h2><p>${ui.a(v.invalid, '#address')}</p></div>` : '';
        const rows = v.rows.map((k, i) => `<tr><th>${esc(k)}</th><td>${esc(vals[i])}${i === 1 && state === 'invalid' ? `<div class="err">${esc(v.invalid)}</div>` : ''}</td><td>${ui.a(v.change, '/parking/permits/resident')}</td></tr>`).join('');
        return `${sum}<p class="muted">${esc(v.kind)}</p><h1>${esc(v.h)}</h1><table>${rows}</table><p>${esc(v.decl)}</p><p>${ui.btn(v.submit, { pri: true, acted: true })}</p>`;
      },
      aside(state, ui) {
        return box(v.apps, list(status(state).map(([k, s]) => `${esc(k)}: <strong>${esc(s)}</strong>`))) + box(v.nav[1], `<p>${esc(v.help)}</p>`);
      },
      ownSummary: true, drafty: true, ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: '/parking/permits/resident/complete', title: `${v.cTitle} – ${brand}`,
        main(ui) {
          return `<div class="card"><h1>${esc(v.cTitle)}</h1><p>${esc(v.kind)} · ${esc(z)}</p><p><strong>${esc(r)}</strong></p></div><p>${esc(fill(v.cBody, vars))}</p><p>${ui.a(v.nav[0], '/services')}</p>`;
        },
        aside(ui) { return box(v.nav[1], `<p>${esc(v.help)}</p>`); },
      },
      errAt: '/parking/permits/resident/submit',
      why: {
        change: `"${v.apps}" now shows the resident permit as "${v.sent}" with reference ${r}`,
        wrong: `the visitor permit application was submitted while the resident permit is still "${v.draft}"`,
        unchanged: `the resident permit is still "${v.draft}"`,
        confirm: `says the resident permit application for zone ${z} is complete with reference ${r}`,
      },
    };
  },
};
