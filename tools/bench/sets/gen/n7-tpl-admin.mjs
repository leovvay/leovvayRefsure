// Template admin-users: an internal admin console's user management page (role change form, user search).
// Categories: results (user search), confirmation (role updated), error (role change refused), greeting.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { people } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Ledgerline Admin', 'Stackyard Console', 'Opsbench'], nav: ['Dashboard', 'Users', 'Groups', 'Audit log', 'Settings'],
    users: [['Rachel', 'Rachel Imre'], ['Simon', 'Simon Abara'], ['Yara', 'Yara Lindqvist'], ['Henry', 'Henry Okafor']],
    h: 'Users', crumbs: ['Admin', 'Users'], change: 'Change a user’s role', user: 'User', role: 'New role', roles: ['Viewer', 'Editor', 'Billing admin', 'Owner'], apply: 'Apply',
    find: 'Find users', ph: 'name, email or team', note: 'Role changes are recorded in the audit log and take effect at the user’s next sign-in.',
    side: ['Shortcuts', 'Invite users', 'Pending approvals', 'Export audit log'],
    ok: '{u} is now {role}', neg: 'The role of {u} was not changed.', pending: 'Updating the role…', mention: 'A confirmation will appear here once the role change is saved.',
    e1: 'Role not changed: a workspace must keep at least one Owner.', e2: 'Role not changed: you do not have permission to grant Billing admin.',
    clear: 'Role change checked. No conflicts found.', checking: 'Checking the role change for conflicts…', emention: 'If a role change is not allowed, the reason is shown here.',
    errSpec: 'an error saying the workspace must keep at least one Owner',
    staff: ['Dana Whitlow', 'Felix Morrow', 'Greta Lind', 'Hugo Marsh'],
    q: ['marketing', 'warehouse', 'legal'], rows: { marketing: ['Ava Brennan · Marketing · Editor', 'Liam Croft · Marketing · Viewer', 'Zoe Hart · Marketing · Editor'], warehouse: ['Omar Diaz · Warehouse · Viewer', 'Pia Sørensen · Warehouse · Editor'], legal: ['Ruth Kane · Legal · Owner', 'Sam Yeo · Legal · Viewer'] },
  },
  de: {
    brands: ['Kontor Admin', 'Stapelhof Konsole', 'Werkbank Ops'], nav: ['Übersicht', 'Benutzer', 'Gruppen', 'Protokoll', 'Einstellungen'],
    users: [['Ruth', 'Ruth Imhof'], ['Simon', 'Simon Achterberg'], ['Yara', 'Yara Lindner'], ['Henrik', 'Henrik Ott']],
    h: 'Benutzer', crumbs: ['Verwaltung', 'Benutzer'], change: 'Rolle eines Benutzers ändern', user: 'Benutzer', role: 'Neue Rolle', roles: ['Leser', 'Bearbeiter', 'Abrechnungsadmin', 'Inhaber'], apply: 'Übernehmen',
    find: 'Benutzer suchen', ph: 'Name, E-Mail oder Team', note: 'Rollenänderungen werden protokolliert und gelten ab der nächsten Anmeldung.',
    side: ['Schnellzugriff', 'Benutzer einladen', 'Offene Freigaben', 'Protokoll exportieren'],
    ok: '{u} ist jetzt {role}', neg: 'Die Rolle von {u} wurde nicht geändert.', pending: 'Rolle wird aktualisiert…', mention: 'Hier erscheint eine Bestätigung, sobald die Rollenänderung gespeichert ist.',
    e1: 'Rolle nicht geändert: Ein Arbeitsbereich braucht mindestens einen Inhaber.', e2: 'Rolle nicht geändert: Sie dürfen die Rolle Abrechnungsadmin nicht vergeben.',
    clear: 'Rollenänderung geprüft. Keine Konflikte gefunden.', checking: 'Rollenänderung wird auf Konflikte geprüft…', emention: 'Ist eine Rollenänderung nicht erlaubt, steht der Grund hier.',
    errSpec: 'an error saying the workspace must keep at least one Owner',
    staff: ['Dana Wittler', 'Felix Morgen', 'Greta Lind', 'Hugo Marsch'],
    q: ['Marketing', 'Lager', 'Recht'], rows: { Marketing: ['Anna Brenner · Marketing · Bearbeiter', 'Lukas Kroll · Marketing · Leser', 'Zoe Hart · Marketing · Bearbeiter'], Lager: ['Omar Diaz · Lager · Leser', 'Pia Sörensen · Lager · Bearbeiter'], Recht: ['Ruth Kahn · Recht · Inhaber', 'Sami Yildiz · Recht · Leser'] },
  },
};

export const adminUsers = {
  id: 'admin-users', kind: 'admin', langs: ['en', 'de'], cats: ['results', 'confirmation', 'error', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const [u, u2] = rng.shuffle(v.staff);
    const role = v.roles[1 + rng.int(2)];
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    const fill = (t, who) => t.replace('{u}', who).replace('{role}', role);
    return {
      kind: 'admin', brand, title: `${v.h} · ${brand}`, at: '/admin/users', host: 'admin', nav: v.nav, slug: 'admin', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<h1>${esc(v.h)}</h1>${slot}<div class="card"><h2>${esc(v.change)}</h2>${ui.select(v.user, v.staff, u)}${ui.select(v.role, v.roles, role)}<p>${ui.btn(v.apply, { pri: true })}</p></div>
<div class="card"><h2>${esc(v.find)}</h2><input type="search" value="" placeholder="${esc(v.ph)}"></div><p class="muted">${esc(v.note)}</p>`;
      },
      aside(ui) { return box(v.side[0], list(v.side.slice(1).map((x) => ui.a(x, '/admin')))); },
      cats: {
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
        confirmation: { ok: fill(v.ok, u), wrong: fill(v.ok, u2), neg: fill(v.neg, u), pending: v.pending, mention: v.mention, spec: `a confirmation that ${u} now has the ${role} role` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
      },
    };
  },
};
