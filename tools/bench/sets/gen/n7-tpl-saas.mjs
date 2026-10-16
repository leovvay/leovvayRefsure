// Template saas-members: a SaaS workspace's "Members" settings page with an invite form. Categories: greeting,
// confirmation (invite sent), error (invite refused), results (member search). No member list outside the slot.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { people } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Taskloom', 'Quillery', 'Brightpane', 'Orbitdesk'], nav: ['Home', 'Projects', 'Reports', 'Settings'],
    users: [['Mara', 'Mara Quint'], ['Owen', 'Owen Strick'], ['Priya', 'Priya Calder'], ['Tobias', 'Tobias Fenwick']],
    h: 'Members', crumbs: ['Settings', 'Members'], side: ['Workspace', 'General', 'Members', 'Roles', 'Security', 'Billing'],
    invite: 'Invite people', email: 'Email address', role: 'Role', roles: ['Member', 'Admin', 'Guest'], send: 'Send invite', find: 'Find a member', ph: 'name or email',
    seats: 'Team plan · 14 seats in use', policy: 'Guests can see only the projects they are added to.',
    ok: 'Invitation sent to {e}', neg: 'The invitation to {e} was not sent.', pending: 'Sending the invitation…', mention: 'A confirmation will appear here once the invitation goes out.',
    e1: 'Invite failed: {e} already belongs to another workspace on this plan.', e2: 'Invite failed: all seats on your plan are in use.',
    clear: 'Email address checked. No problems found.', checking: 'Checking the email address…', emention: 'If an invitation cannot be sent, the reason appears below the form.',
    errSpec: 'an error saying the address already belongs to another workspace',
    q: ['design', 'finance', 'support'], rows: { design: ['Lena Brook · Design lead · Admin', 'Arjun Patel · Product designer · Member'], finance: ['Grace Holm · Finance · Member', 'Dmitri Vale · Controller · Admin', 'Ines Roe · Accounts · Guest'], support: ['Tom Rees · Support · Member', 'Kira Lund · Support lead · Admin'] },
  },
  de: {
    brands: ['Werkraum', 'Taktwerk', 'Klarblick'], nav: ['Start', 'Projekte', 'Berichte', 'Einstellungen'],
    users: [['Lena', 'Lena Brückner'], ['Jonas', 'Jonas Hellwig'], ['Mia', 'Mia Kessler'], ['Felix', 'Felix Orth']],
    h: 'Mitglieder', crumbs: ['Einstellungen', 'Mitglieder'], side: ['Arbeitsbereich', 'Allgemein', 'Mitglieder', 'Rollen', 'Sicherheit', 'Abrechnung'],
    invite: 'Personen einladen', email: 'E-Mail-Adresse', role: 'Rolle', roles: ['Mitglied', 'Admin', 'Gast'], send: 'Einladung senden', find: 'Mitglied suchen', ph: 'Name oder E-Mail',
    seats: 'Team-Tarif · 14 Plätze belegt', policy: 'Gäste sehen nur die Projekte, zu denen sie hinzugefügt wurden.',
    ok: 'Einladung an {e} gesendet', neg: 'Die Einladung an {e} wurde nicht gesendet.', pending: 'Einladung wird gesendet…', mention: 'Hier erscheint eine Bestätigung, sobald die Einladung verschickt ist.',
    e1: 'Einladung fehlgeschlagen: {e} gehört bereits zu einem anderen Arbeitsbereich dieses Tarifs.', e2: 'Einladung fehlgeschlagen: Alle Plätze Ihres Tarifs sind belegt.',
    clear: 'E-Mail-Adresse geprüft. Keine Probleme gefunden.', checking: 'E-Mail-Adresse wird geprüft…', emention: 'Kann eine Einladung nicht gesendet werden, steht der Grund unter dem Formular.',
    errSpec: 'an error saying the address already belongs to another workspace',
    q: ['Design', 'Finanzen', 'Support'], rows: { Design: ['Lena Brook · Designleitung · Admin', 'Arjun Patel · Produktdesign · Mitglied'], Finanzen: ['Grete Holm · Finanzen · Mitglied', 'Dirk Vahl · Controlling · Admin', 'Ines Roth · Buchhaltung · Gast'], Support: ['Tom Rees · Support · Mitglied', 'Kira Lund · Supportleitung · Admin'] },
  },
};

const MAILS = ['noor.haddad', 'ezra.bell', 'sofia.lind', 'kai.morrow', 'ana.reyes', 'luca.ferro'];

export const saasMembers = {
  id: 'saas-members', kind: 'saas', langs: ['en', 'de'], cats: ['greeting', 'confirmation', 'error', 'results'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const [m1, m2] = rng.shuffle(MAILS);
    const e = `${m1}@example.test`;
    const e2 = `${m2}@example.test`;
    const [q, q2] = rng.shuffle(v.q);
    return {
      kind: 'saas', brand, title: `${v.h} · ${brand}`, at: '/settings/members', host: 'app', nav: v.nav, slug: 'app', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<h1>${esc(v.h)}</h1>${slot}<div class="card"><h2>${esc(v.invite)}</h2>${ui.input(v.email, e)}${ui.select(v.role, v.roles, v.roles[0])}<p>${ui.btn(v.send, { pri: true })}</p></div>
<div class="card"><h2>${esc(v.find)}</h2><input type="search" value="" placeholder="${esc(v.ph)}"></div><p class="muted">${esc(v.seats)}. ${esc(v.policy)}</p>`;
      },
      aside(ui) { return box(v.side[0], list(v.side.slice(1).map((x) => ui.a(x, '/settings')))); },
      cats: {
        confirmation: { ok: v.ok.replace('{e}', e), wrong: v.ok.replace('{e}', e2), neg: v.neg.replace('{e}', e), pending: v.pending, mention: v.mention, spec: `a confirmation that the invitation to ${e} was sent` },
        error: { e1: v.e1.replace('{e}', e), e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
      },
    };
  },
};
