/**
 * The trail's page side: refsure's own steps drawn over the agent's Orca tab, for the human who opens it. The whole
 * file is one function expression; build.mjs minifies it and Node sends `${__TRAIL_PAGE__}(${JSON.stringify(spec)})`
 * (spec-v1, "The contract between Node and the page"). Invariants, each the reason refsure's reads never see it:
 * - Synchronous: returns 'ok', 'skip:<why>' or 'err:<name>' and never throws. It hands back no thenable and waits on
 *   no frame, because Orca holds an eval in the tab's one command queue with no deadline.
 * - Origin first (`===` against `location.origin`, before anything the page could patch), then readyState must be
 *   'complete': an extra child of <html> during React 18 document hydration is a mismatch.
 * - One `refsure-trail` host under <html>, aria-hidden (a closed root alone leaks into the AX snapshot), every inline
 *   property !important, direction pinned ltr (`all` leaves an RTL page's direction to inherit and mirror the HUD),
 *   a closed shadow root styled only by one adopted constructed sheet (a <style> element or a style attribute is a
 *   CSP violation sent to the site's report-uri). Found again through the DOM, extras removed; a different `ver` is
 *   disposed and rebuilt; a host the page removed is re-attached with its rows.
 * - Text only through textContent. Names, roles and refs come from Node, cleaned and cut to 80, each in its own
 *   bidi-isolated span; the page reads no page text and never an input's value (fill shows a typing marker only).
 * - All pointer-events:none, in a 0x0 popover=manual layer re-raised on every apply, so a page dialog opened since
 *   does not cover it. Marks are unfilled corners outside the target box; the cursor tip sits 4 px off the point.
 *   No two class names differ only by case: a quirks-mode document matches classes case-insensitively.
 * - Motion: Web Animations only, id 'refsure-trail', each event done in <= 450 ms, none under reduced motion. A
 *   closed root's animations are not in document.getAnimations() (measured), so settle never waits on them. Frame 0
 *   of every animation is a legible, correct state: a hidden Orca tab commits a frame only when captured, so a
 *   capture right after an apply shows each animation at its first keyframe (spec addendum).
 * - Listeners only while armed: capture, passive, never cancelling or stopping an event, removed on the match or at
 *   the ttl. Pointer, focus and key events must be trusted; an input / change event, which Orca's own fill and
 *   select fire from a script, counts only on a text field (fill) or a select (select). QA only: `spec.qaTrust === true` also takes untrusted pointer, focus and key events, so a harness can
 *   dispatch them from script. Node never sends it.
 * - Never moves focus, navigates, or touches page storage or the network. Its only page reads are geometry: the
 *   acted element's box, and 15 elementFromPoint per top corner to keep the HUD off the page's controls, h1-h3 and
 *   images.
 */
(function (spec) {
  const VER = 1, ID = 'refsure-trail', NS = 'http://www.w3.org/2000/svg', MAX = 12, KEEP = 3, MARK_MS = 2500;
  // Read per animation: reduced motion means none.
  const go = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Every declaration !important (spec: host style).
  const HOST = ('all:initial;display:block;position:fixed;inset:0 auto auto 0;width:0;height:0;overflow:visible;'
    + 'pointer-events:none;z-index:2147483647;contain:style;direction:ltr;').replace(/;/g, '!important;');
  // A drafting sheet's title block in blueprint navy: one type size but for the speed figures (the step's total, busy
  // and agent at 13 px, the first thing the eye finds); rank is weight, case and the reversed cells. Tabular figures,
  // hairline rules. A phase is plain colour, everywhere: read cyan, decide amber, act orange. A result is a cell: ok
  // mint text; refused and no input seen reversed red, abstained reversed amber, like the action tag, so a failure
  // never reads as an act. Refs are muted. Marks on the page are orange over a navy casing, so one colour reads on
  // white, dark and busy pages alike. `.ly` opens with the popover's functional reset: the UA gives :popover-open
  // inset 0, margin auto, border, padding and a Canvas background.
  const CSS = '*{box-sizing:border-box;margin:0;padding:0;pointer-events:none!important}path{fill:none;stroke-linecap:square}'
    + '.ly{position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;width:0;height:0;overflow:visible;color:inherit;'
    + '--g:#0a2470;--l:rgba(150,178,255,.3);--t:#f2f5ff;--d:#a9bcf2;--r:#5ed8ff;--y:#ffc23d;--a:#ff6a2e;--k:#43e3a2;--n:#ff5c73;--m:#ff5a1f;'
    + '--s:0 10px 24px -6px rgba(2,8,36,.55);font:500 11px/16px system-ui,sans-serif;font-variant-numeric:tabular-nums}'
    + '.ly::backdrop{display:none}@media print{.ly{display:none!important}}.hu.l{right:auto;left:12px}.hu.z,.n1{display:none}'
    + '.hu{position:fixed;top:12px;right:12px;width:304px;color:var(--t);background:var(--g);border:1px solid var(--l);border-radius:3px;box-shadow:var(--s);overflow:hidden}'
    + '.lg,.ro,.r .r,.tg,.m,.bd,.gg,.hn,.ha,.hc,.ht,.ca{flex:none}'  // fixed-size parts; before .f and .bz, under .lv .hc
    + '.r{display:flex;align-items:center;gap:6px;height:16px;white-space:nowrap;min-width:0}.hd{height:24px;padding:0 8px}.hs{padding:3px 8px 4px}'
    + '.hd,.lv,.hs{border-bottom:1px solid var(--l)}.lv{display:grid;gap:3px;padding:6px 8px 7px}.e{font-weight:700}.u{color:var(--d)}.f{flex:1;min-width:0}'
    + '.k{font-weight:600;text-transform:uppercase;letter-spacing:.06em}.tg{padding:0 4px;border-radius:2px;background:var(--t);color:var(--g)}'
    + '.lg .cr{stroke-width:1.5}.x{overflow:hidden;text-overflow:ellipsis;min-width:0}.i{unicode-bidi:isolate}'
    + '.nm{min-width:3em}.nm:before{content:"\\201C"}.nm:after{content:"\\201D"}.m{font:500 11px ui-monospace,Menlo,Consolas,monospace}'
    + '.a,.cl>.k:first-child{color:var(--a)}.bd{padding:0 3px;border-radius:2px}.ok{color:var(--k)}.no,.ab{color:var(--g);background:var(--n)}'
    + '.ab{background:var(--y)}.pe{box-shadow:inset 0 0 0 1px var(--d)}.fg{font-size:13px}.ml{margin-left:auto}.c .k{margin-right:2px}'
    // The gauge, inline after `p >= thr`: 0 to 1 between end ticks, the accept zone hatched from the threshold up (a
    // drawing's section hatch), the threshold a datum line, the confidence a bar: mint at or over it, amber under.
    + '.gg,.bz{background:linear-gradient(var(--d),var(--d)) 0 50%/100% 1px no-repeat}.gg i{position:absolute}.gh,.gm{top:0;height:11px}'
    + '.gg{position:relative;width:64px;height:11px;border:solid var(--d);border-width:0 1px}'
    + '.gz{right:0;top:2px;height:7px;background:repeating-linear-gradient(135deg,var(--k) 0 1px,transparent 1px 3px)}.gh{width:1px;background:var(--t)}'
    + '.gm{width:3px;margin-left:-1px;background:var(--k);box-shadow:0 0 0 1px var(--g)}.gm.lo{background:var(--y)}.p1{color:var(--r)}.p2{color:var(--y)}.p3{color:var(--a)}'
    // The phase chain is a chained dimension: a tick at each phase boundary and the bar between in the phase's
    // colour, 40 px wide for the live step and every history row alike, on one ms scale, so lengths compare across
    // steps. The live one alone gives way (to 20 px) before a long phase row clips its total.
    + '.ch{display:flex;height:9px;border-right:1px solid var(--t);min-width:3px}'
    + '.ch i{position:relative;flex:1 1 0;min-width:2px;border-left:1px solid var(--t);transform-origin:0 50%}'
    + '.ch i:after{content:"";position:absolute;left:0;right:0;top:3px;height:3px;background:currentColor}'
    + '.hs .r{height:15px;color:var(--d)}.hn{width:14px}.ha{width:46px;color:var(--t)}.hc{width:40px}.lv .hc{flex:0 1 40px;min-width:20px}'
    + '.ht{width:46px;text-align:right;color:var(--t)}.hs .bd{width:42px;padding:0;text-align:center}.v .ha,.v .x{text-decoration:line-through}'
    + '.ft{height:24px;padding:0 8px}.bz{position:relative;flex:1;height:8px}.bz i{position:absolute;top:2px;height:4px;min-width:2px;background:var(--t)}'
    + '.lk,.cl,.rg,.cu,.sc,.sv{position:fixed;left:0;top:0;overflow:visible}.sv{left:auto;right:12px;top:calc(50% - 32px)}'
    + '.cs{stroke:var(--g);stroke-width:4}.cr{stroke:var(--m);stroke-width:2}.hl{stroke:var(--m);stroke-width:1;opacity:.6}'
    + '.cu .cr{fill:var(--m);stroke:var(--g);stroke-width:1.25;stroke-linejoin:round}.en .cr{stroke:var(--t);stroke-width:1.5}'
    + '.cl{display:flex;align-items:center;gap:6px;height:20px;max-width:320px;padding:0 6px;white-space:nowrap;color:var(--t);'
    + 'background:var(--g);border:1px solid var(--l);border-radius:2px;box-shadow:var(--s)}.wv{opacity:0}'
    + '.rg{width:30px;height:30px;margin:-15px 0 0 -15px;border:2px solid var(--m);border-radius:50%;box-shadow:0 0 0 1px var(--g),inset 0 0 0 1px var(--g);transform:scale(.4)}'
    + '.sc{right:0;height:2px;background:var(--r);box-shadow:0 1px var(--g),0 -1px var(--g);opacity:0}.ca{width:2px;height:11px;background:var(--t)}'
    // Narrow: no history, gauge or busy track, and a phase is its initial (R / D / A) before its number.
    + '@media (max-width:560px){.hu{top:8px;right:8px;width:248px}.hu.l{left:8px}.hs,.w,.gg,.bz{display:none}.n1{display:inline}}';
  // The element an act lands on. A role counts only when it names a control, so role=presentation wrappers are climbed.
  const CTRL = 'a[href],button,input,select,textarea,summary,label,[contenteditable],[tabindex]:not([tabindex="-1"])';
  const ROLE = /^(button|link|checkbox|radio|switch|tab|menuitem\w*|option|combobox|listbox|textbox|searchbox|slider|spinbutton|treeitem)$/;
  const ACTS = /^(click|dblclick|fill|select|check|uncheck|enter|scroll)$/;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sp = (cls, text) => el('span', cls, text), div = (cls) => el('div', cls), box = (n) => n.getBoundingClientRect();
  const css = (n, k, v) => n.style.setProperty(k, v), at = (n, x, y) => { css(n, 'left', x + 'px'); css(n, 'top', y + 'px'); };
  const svg = (cls, w, h, paths) => {
    const s = document.createElementNS(NS, 'svg');
    for (const [k, v] of [['class', cls], ['width', w], ['height', h], ['viewBox', '0 0 ' + w + ' ' + h]]) s.setAttribute(k, v);
    for (const [c, d] of paths) { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', c); p.setAttribute('d', d); s.append(p); }
    return s;
  };
  const num = (x) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : null), str = (x, n) => (typeof x === 'string' && x ? x.slice(0, n) : null);
  const sum = (r) => (r.read || 0) + (r.decide || 0) + (r.act || 0), unit = (x) => Math.min(1, Math.max(0, x));
  // An act this page has no act time for: pending, or a single-shot act whose result never comes back (decision 2). Its
  // sum is only the read and decide, so every total it is in reads `≥`.
  const open = (r) => r.kind === 'act' && r.act == null;
  const pad = (n) => (n < 10 ? '0' : '') + n, grp = (n) => Math.round(n).toLocaleString('en');
  // Minutes and seconds both come from one rounded second count, so 119.6 s reads 2:00, never 1:00.
  const dur = (ms, s = Math.round(ms / 1000)) => ms < 1000 ? Math.round(ms) + ' ms' : ms < 60000 ? (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s'
    : Math.floor(s / 60) + ':' + pad(s % 60) + ' min';
  const word = (r) => !r ? 'input' : r.kind === 'read' ? r.verb || 'read' : ACTS.test(r.action) ? r.action : 'act';
  // Only the fields the contract names, each bounded; anything else in a row is dropped.
  const clean = (r) => {
    if (!r || typeof r.id !== 'string' || num(r.at) == null) return null;
    const p = r.phases || {}, w = r.why || {}, t = r.target;
    return {
      id: r.id.slice(0, 64), at: r.at, end: num(r.end), verb: str(r.verb, 16), step: num(r.step), kind: r.kind === 'read' ? 'read' : 'act',
      action: str(r.action, 12), marker: str(r.marker, 8), result: str(r.result, 10) || 'pending', detail: str(r.detail, 16),
      target: t && typeof t.ref === 'string' ? { ref: str(t.ref, 16), role: str(t.role, 24), name: str(t.name, 80) } : null,
      read: num(p.read), nodes: num(p.nodes), decide: num(p.decide), act: num(p.act), p: num(w.p), thr: num(w.threshold),
      by: /^(decision|code|agent)$/.test(w.by) ? w.by : null, site: str(w.site, 32), model: str(w.model, 32),
    };
  };
  // Role, "name", ref. The role never shrinks; the name gives way. The HUD's live row (`bare`) leaves the role out
  // beside a name: the callout on the page names both.
  const target = (p, t, bare) => {
    if (t.role && !(bare && t.name)) p.append(sp('u i ro w', t.role));
    if (t.name) p.append(sp('i x nm', t.name));
    if (t.ref) p.append(sp('i m u', t.ref));
  };
  const build = (KEY) => {
    const host = document.createElement('refsure-trail'), sheet = new CSSStyleSheet(), ly = div('ly'), hud = div('hu z');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = HOST;
    const root = host.attachShadow({ mode: 'closed' }), pop = typeof ly.showPopover === 'function';
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    if (pop) ly.setAttribute('popover', 'manual');
    ly.append(hud);
    root.append(ly);
    // rows: merged by id, the newest 12 by `at`. seen: what this page saw of an armed act's input ('sent' or 'none'),
    // keyed '#'+id so no id names a prototype slot. side: the HUD's corner, 0 top right, 1 top left. hot: the acted
    // element's box while its marks are up, so every draw in that time keeps the HUD off it.
    let rows = [], seen = {}, count = 0, armed = null, marks = [], markAt = null, markTimer = 0, anims = [], side = 0, hot = null;
    // Last into the top layer, in the same task. A manual popover closes nothing and takes no focus.
    const raise = () => { if (pop) try { ly.hidePopover(); ly.showPopover(); } catch (e) { /* z-index holds */ } };
    // One authored moment per event; `backwards` holds frame 0 through a stagger delay, and frame 0 is legible.
    const anim = (n, kf, ms, delay) => {
      if (go()) try { anims.push(n.animate(kf, { id: ID, duration: ms, delay: delay || 0, fill: 'backwards', easing: 'cubic-bezier(.16,1,.3,1)' })); } catch (e) { /* drawn */ }
    };
    const finish = () => { for (const a of anims) try { a.finish(); } catch (e) { /* done */ } anims = []; };
    const put = (n, x, y) => { at(n, x, y); ly.append(n); marks.push(n); };
    const clearMarks = () => { for (const n of marks) n.remove(); marks = []; markAt = null; hot = null; clearTimeout(markTimer); };
    const later = () => {
      clearTimeout(markTimer);
      markAt = [scrollX, scrollY];
      markTimer = setTimeout(() => { try { clearMarks(); } catch (e) { /* nothing left */ } }, MARK_MS);
    };
    // composedPath()[0] climbs to the nearest control, out through open shadow roots, else stays on itself (`strict`:
    // null). A frame or the page itself gets nothing.
    const control = (n, strict) => {
      let first = null;
      for (let hop = 0; n && hop < 40; hop++) {
        if (n.nodeType !== 1) { n = n.nodeType === 11 ? n.host : n.parentNode; continue; }
        if (/^(HTML|BODY|IFRAME|FRAME)$/.test(n.tagName)) break;
        if (n.matches(CTRL) || ROLE.test(n.getAttribute('role') || '')) return n;
        first = first || n;
        n = n.parentNode;
      }
      return strict ? null : first;
    };
    // Corner marks 6 px outside the box over a hairline frame. Frame 0 sits a fixed 8 px further out on every side,
    // per axis, and closes onto the box: a uniform scale put the corners ~60 px off an 800 px field in a capture.
    const lock = (r) => {
      const w = Math.round(r.width + 12), h = Math.round(r.height + 12), a = Math.max(4, Math.min(12, w / 3, h / 3));
      const d = `M1 ${a}V1H${a}M${w - a} 1H${w - 1}V${a}M${w - 1} ${h - a}V${h - 1}H${w - a}M${a} ${h - 1}H1V${h - a}`;
      const s = svg('lk', w, h, [['hl', `M1 1H${w - 1}V${h - 1}H1Z`], ['cs', d], ['cr', d]]);
      put(s, r.left - 6, r.top - 6);
      anim(s, [{ transform: `scale(${(w + 16) / w},${(h + 16) / h})` }, { transform: 'none' }], 320);
    };
    // What refsure acted on, from Node's row and never from the page, above the box (below it near the top). A
    // field's label sits above its left edge, so on a field (focus, Enter, change) the callout ends at the box's right.
    const callout = (r, row, kind) => {
      const t = div('cl'), y = kind === 'focus' && (!row || row.marker === 'typing') ? sp('ca') : null;
      t.append(sp('k', word(row)));
      if (row && row.target) target(t, row.target);
      if (y) t.append(y, sp('k u', 'typing'));
      if (kind === 'key') t.append(svg('en', 12, 12, [['cr', 'M10.5 2V7.5H2.5M5 5L2.5 7.5L5 10']]));
      if (kind === 'change' && (!row || row.marker === 'option')) t.append(sp('k u', 'option'));
      put(t, 0, 0);
      const w = box(t).width;
      at(t, Math.max(4, Math.min(kind === 'point' ? r.left - 6 : r.right + 6 - w, innerWidth - w - 4)), r.top < 34 ? r.bottom + 10 : r.top - 30);
      if (y) anim(y, [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], 440);
    };
    // A ring stays on the point and a wave leaves it once; the cursor's tip is 4 px off, toward the lower right.
    const ripple = (x, y) => {
      const wave = div('rg wv');
      put(div('rg'), x, y);
      put(wave, x, y);
      put(svg('cu', 12, 16, [['cr', 'M1 1V13L4.2 10.1L6.6 15L8.6 14L6.3 9.2H10.5Z']]), x + 4, y + 4);
      anim(wave, [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], 420);
    };
    // A read sweeps the viewport once, top to bottom; at rest the line is gone and the HUD keeps the numbers.
    // Both are anchored by CSS, not innerWidth / innerHeight, so they follow the viewport whatever size the hidden tab
    // had when they were drawn (an arrow placed from innerWidth was missing from an Orca capture).
    const scan = () => {
      const s = div('sc'), y = 'translateY(calc(100vh - 2px))';
      put(s, 0, 0);
      anim(s, [{ transform: 'translateY(0)', opacity: 1 }, { transform: y, opacity: 1, offset: 0.9 }, { transform: y, opacity: 0 }], 440);
      later();
    };
    // A scroll is a dimension arrow on the viewport's right edge, clear of the centre.
    const scrolled = () => {
      const d = 'M7 1V61M2 56L7 61L12 56M2 1H12', v = svg('sv', 14, 64, [['cs', d], ['cr', d]]);
      ly.append(v);
      marks.push(v);
      anim(v, [{ transform: 'translateY(-12px)' }, { transform: 'translateY(0)' }], 360);
      later();
    };
    // The input landed: lock on to the control, ripple and cursor at a point, the typing / Enter / option marker.
    const hit = (me, c, e) => {
      let r = c && box(c);
      seen['#' + me.id] = 'sent';
      clearMarks();
      finish();
      if (r && (r.width > 0 || r.height > 0)) { lock(r); callout(r, rows.find((x) => x.id === me.id), me.kind); } else r = null;
      if (me.kind === 'point' && typeof e.clientX === 'number') ripple(e.clientX, e.clientY);
      later();
      hot = r;
      render(1);
    };
    const disarm = () => {
      if (!armed) return;
      for (const t of armed.types) removeEventListener(t, armed.on, { capture: true });
      clearTimeout(armed.timer);
      armed = null;
    };
    // The act's own input names the exact element (decision 4): one arm, listeners only until the match or the ttl,
    // and a ttl with no match, or the next act's arm, leaves the row 'no input seen'. A pointer, focus or key event
    // must be trusted. A field's `input` / `change` need not be, on the right kind of control only: Orca's fill and
    // select set the value from a script, and in a tab whose document lacks focus (any tab not yet clicked) its
    // focus fires no focusin (measured on Orca 1.4.230: a fill there fires only untrusted input and change).
    const arm = (a, trust) => {
      if (armed && armed.id !== a.id && !seen['#' + armed.id]) seen['#' + armed.id] = 'none';
      disarm();
      const kind = a.kind, types = { point: ['pointerdown'], focus: ['focusin', 'input'], key: ['keydown'], change: ['change', 'input'] }[kind];
      if (!Array.isArray(types) || typeof a.id !== 'string') return;
      const me = { id: a.id.slice(0, 64), kind, types, on: null, timer: 0 };
      me.on = (e) => {
        try {
          const typed = e.type === 'input' || e.type === 'change';
          if (armed !== me || (!typed && !e.isTrusted && !trust) || (kind === 'key' && e.key !== 'Enter')) return;
          const c = control(e.composedPath()[0] || e.target), role = c && c.getAttribute('role') || '';
          if (kind === 'change' && !(c && (c.tagName === 'SELECT' || /^(listbox|option|combobox)$/.test(role)))) return;
          if (kind === 'focus' && typed && !(c && (/^(INPUT|TEXTAREA)$/.test(c.tagName) || c.isContentEditable || /^(textbox|searchbox|combobox)$/.test(role)))) return;
          disarm();
          hit(me, c, e);
        } catch (x) { /* the page's event goes on untouched */ }
      };
      for (const t of types) addEventListener(t, me.on, { capture: true, passive: true });
      me.timer = setTimeout(() => {
        try { if (armed === me) { disarm(); seen['#' + me.id] = 'none'; render(1); } } catch (x) { /* nothing to undo */ }
      }, num(a.ttl) ? Math.min(a.ttl, 10000) : 3000);
      armed = me;
    };
    // The HUD stays in a top corner, where a glance finds it (banners and chat live below): top right unless top left
    // covers strictly less of the page (a 5x3 hit test, which never returns our pointer-events:none nodes; a control,
    // image or header link costs one, an h1-h3 two: the page's own title is what a human reads first), and never the
    // corner over the element just acted on while its marks are up (`hot`).
    const place = () => {
      const r = hot, b = box(hud), m = innerWidth > 560 ? 12 : 8, y = m;
      const cost = (c) => {
        const x = c ? m : innerWidth - m - b.width, k = [];
        let n = (c === side ? -0.5 : 0) + (r && r.right > x - 8 && r.left < x + b.width + 8 && r.top < y + b.height + 8 ? 99 : 0);
        for (let q = 0; q < 15; q++) {
          let e = document.elementFromPoint(x + b.width * (q % 5 * 2 + 1) / 10, y + b.height * ((q / 5 | 0) * 2 + 1) / 6);
          if ((e = e && (e.tagName === 'IFRAME' ? e : control(e, true) || e.closest('h1,h2,h3,img,header a'))) && !k.includes(e)) { k.push(e); n += /^H[1-3]$/.test(e.tagName) ? 2 : 1; }
        }
        return n;
      };
      side = cost(1) < cost(0) ? 1 : 0;
      hud.classList.toggle('l', side === 1);
    };
    // [long, class, short]. A pending act reads from its arm and from what this page saw of its input; Node's later
    // result wins. A failure is a reversed cell: `no` red, `ab` amber.
    const badge = (r, short) => {
      const d = r.detail && r.detail !== 'low_confidence' ? ' · ' + r.detail.replace('_', ' ') : '', s = seen['#' + r.id];
      const st = r.result === 'pending' ? (s === 'sent' ? ['input seen', '', 'sent'] : s === 'none' || r.detail === 'no_input'
        ? ['no input seen', 'no', 'none'] : armed && armed.id === r.id ? ['armed', 'pe a', 'arm'] : ['pending', 'pe', 'wait'])
        : r.result === 'ok' ? ['ok', 'ok', 'ok']
        : r.result === 'refused' ? ['refused' + d, 'no', 'void'] : r.result === 'abstained' ? ['abstained' + d, 'ab', 'abst'] : ['unknown', 'u', 'unkn'];
      return sp('bd k e ' + st[1], st[short ? 2 : 0]);
    };
    const chain = (r, scale, grow) => {
      const c = div('ch'), total = sum(r);
      let n = 0;
      css(c, 'width', (total > 0 ? Math.max(1, total / scale * 100) : 0) + '%');
      [r.read, r.decide, r.act].forEach((v, i) => {
        if (!(v > 0)) return;
        const s = el('i', 'p' + (i + 1));
        css(s, 'flex-grow', String(v));
        c.append(s);
        if (grow) anim(s, [{ transform: 'scaleX(.3)' }, { transform: 'scaleX(1)' }], 260, 70 * n++);
      });
      return c;
    };
    // A phase cell: its name in the phase colour, the number white; narrow, the name is its initial.
    const cell = (p, label, v, k, wait) => {
      const c = sp('c');
      c.append(sp('k w p' + k, label), sp('k n1 p' + k, label[0]), sp('e', v == null ? '—' : String(Math.round(v))));
      if (v != null || wait) p.append(c);
    };
    // Why: the Decision site in the decide colour, its model, then `p 0.93 ≥ 0.80` and the gauge on the same row.
    const why = (r) => {
      // num() keeps p >= 0, so against a null threshold `<` is false; `ok` is read only when thr is set.
      const n = div('r'), q = sp('ml'), ok = r.p >= r.thr;
      if (r.by !== 'decision') return n.append(sp('k u', 'by ' + r.by), sp('u', r.by === 'code' ? 'no model call' : 'its own ref')), n;
      n.append(sp('k p2 i x', r.site || 'decision'));
      if (r.model) n.append(sp('i m u w', r.model));
      if (r.p == null) return n;
      // Under the threshold p is cut to 2 places, never rounded up to it: 0.796 against 0.80 reads 0.79.
      q.append(sp('u', 'p '), sp('e', r.thr != null && !ok ? r.p.toFixed(3).slice(0, -1) : r.p.toFixed(2)));
      if (r.thr != null) q.append(sp(ok ? 'ok' : 'p2', ok ? ' ≥ ' : ' < '), sp('', r.thr.toFixed(2)));
      return n.append(q, gauge(r)), n;
    };
    const gauge = (r) => {
      const g = div('gg'), m = el('i', 'gm' + (r.p < r.thr ? ' lo' : ''));
      if (r.thr != null) for (const c of ['gz', 'gh']) { const z = el('i', c); css(z, 'left', unit(r.thr) * 100 + '%'); g.append(z); }
      css(m, 'left', unit(r.p) * 100 + '%');
      g.append(m);
      return g;
    };
    const hrow = (r, scale) => {
      const h = div('r' + (r.result === 'refused' ? ' v' : '')), c = div('hc'), t = r.target;
      c.append(chain(r, scale, false));
      h.append(sp('hn', pad(r.seq)), sp('k ha', word(r)), t && t.name ? sp('i x f nm', t.name)
        : sp('i x f', t ? t.role || t.ref : r.nodes != null ? grp(r.nodes) + ' nodes' : ''), c, sp('ht', (open(r) ? '≥' : '') + dur(sum(r))), badge(r, true));
      return h;
    };
    // Busy is every ms inside a step, plus the gaps between consecutive steps of one command (`run`'s loop, one `do`'s
    // acts: Node numbers both). Every other gap lies between commands: the agent's turn. All from the rows' own `at`,
    // `end` and phases. An open act counts its read and decide only, so busy is then a floor (`open`).
    const times = () => {
      const t = { start: 0, end: 0, busy: 0, agent: 0, spans: [], open: false };
      let cur = 0, prev = null;
      for (const r of rows) {
        const e = Math.max(r.at, r.end != null && r.end > r.at ? r.end : r.at + sum(r)), last = t.spans[t.spans.length - 1];
        let from = Math.max(r.at, cur);
        if (!prev) t.start = cur = from = r.at;
        else if (r.at > cur && !(prev.verb === r.verb && prev.step != null && r.step === prev.step + 1)) t.agent += r.at - cur;
        else from = cur;
        if (e > from) t.busy += e - from;
        if (last && from <= last[1]) last[1] = Math.max(last[1], e); else t.spans.push([from, e]);
        cur = Math.max(cur, e);
        t.open = t.open || open(r);
        prev = r;
      }
      t.end = cur;
      return t;
    };
    // The HUD, rebuilt whole per apply (12 rows at most): title row (the live row's command and its own step; the
    // steps this page holds and their span, `last 12` once older ones are dropped, as are busy and agent), the live
    // step in three rows (tag, why, phases), history, busy against agent time. fx 2 is a new step (its chain draws in from stubs, its tag flashes); 1 a changed state (the badge's
    // ring flashes: a ring, so frame 0 keeps a reversed cell legible).
    const render = (fx) => {
      const live = rows[rows.length - 1], tm = times(), shown = rows.slice(-1 - KEEP), n = rows.length;
      hud.replaceChildren();
      hud.classList.toggle('z', !live);
      if (!live) return;
      const scale = Math.max(1, ...shown.map(sum)), span = Math.max(1, tm.end - tm.start), tag = sp('tg k e', word(live)), bd = badge(live, false);
      const hd = div('r hd'), lv = div('lv'), a = div('r'), ce = div('r'), hc = div('hc ml'), bz = div('bz'), ft = div('r ft');
      hd.append(svg('lg', 11, 11, [['cr', 'M1 4V1H4M7 1H10V4M10 7V10H7M4 10H1V7']]), sp('e', 'refsure'),
        sp('u i x', (live.verb || '') + (live.step != null ? ' · step ' + live.step : '')), sp('f'),
        sp('e', (count > n ? 'last ' : '') + n), sp('u', (n > 1 ? 'steps' : 'step') + ' ·'), sp('e', dur(tm.end - tm.start)));
      a.append(tag);
      if (live.target) target(a, live.target, true); else if (live.kind === 'read') a.append(sp('u', 'snapshot'));
      // The read's node count and the result end the row together (no spacer's gap: the name gets it). The count goes
      // when the row still overflows with the name at its least (a long result beside a long ref), never cut.
      const end = sp('r ml'), nd = live.nodes != null && sp('u w', grp(live.nodes) + ' nodes');
      if (nd) end.append(nd);
      end.append(bd);
      a.append(end);
      lv.append(a);
      if (live.by) lv.append(why(live));
      cell(ce, 'read', live.read, 1, false);
      cell(ce, 'decide', live.decide, 2, false);
      if (live.kind === 'act') cell(ce, 'act', live.act, 3, open(live));
      hc.append(chain(live, scale, fx === 2));
      ce.append(hc, sp('u', open(live) ? '≥' : '='), sp('e fg', dur(sum(live))));
      lv.append(ce);
      hud.append(hd, lv);
      if (shown.length > 1) {
        const hs = div('hs');
        for (let i = shown.length - 2; i >= 0; i--) hs.append(hrow(shown[i], scale));
        hud.append(hs);
      }
      for (const [from, to] of tm.spans) {
        const s = el('i');
        css(s, 'left', (from - tm.start) / span * 100 + '%');
        css(s, 'width', (to - from) / span * 100 + '%');
        bz.append(s);
      }
      if (nd && a.scrollWidth > a.clientWidth) nd.remove();
      ft.append(sp('k u', 'busy'), sp('e fg', (tm.open ? '≥ ' : '') + dur(tm.busy)), bz, sp('k u ml', 'agent'), sp('e fg', dur(tm.agent)));
      hud.append(ft);
      if (fx === 2) anim(tag, [{ background: '#ff6a2e' }, { background: '#f2f5ff' }], 420);
      if (fx) anim(bd, [{ outline: '2px solid #f2f5ffa0' }, { outline: '2px solid #f2f5ff00' }], 420);
      place();
    };
    const apply = (s) => {
      if (!host.isConnected) document.documentElement.append(host);
      raise();
      if (markAt && (scrollX !== markAt[0] || scrollY !== markAt[1])) clearMarks();  // viewport marks go stale on a scroll
      let fresh = null, changed = null;
      for (const raw of Array.isArray(s.rows) ? s.rows.slice(0, 24) : []) {
        const r = clean(raw), j = r ? rows.findIndex((x) => x.id === r.id) : -1;
        if (!r) continue;
        if (j < 0) { r.seq = ++count; rows.push(r); fresh = r.id; } else { r.seq = rows[j].seq; rows[j] = r; changed = r.id; }
      }
      rows.sort((a, b) => a.at - b.at);
      while (rows.length > MAX) delete seen['#' + rows.shift().id];
      finish();
      const live = rows[rows.length - 1], now = !!live && live.id === fresh;
      if (now && live.kind === 'read' && go()) scan();
      if (live && live.action === 'scroll' && (now || live.id === changed)) { clearMarks(); scrolled(); }
      if (s.arm && typeof s.arm === 'object') arm(s.arm, s.qaTrust === true);
      render(now ? 2 : live && live.id === changed ? 1 : 0);
      return s.probe === true ? `{"ver":${VER},"rows":${rows.length},"marks":${marks.length},"armed":${!!armed}}` : 'ok';
    };
    // The instance holds closures only, never an element, so the closed root stays closed.
    const inst = Object.freeze({ ver: VER, apply, dispose: () => { disarm(); clearMarks(); finish(); host.remove(); } });
    Object.defineProperty(host, KEY, { value: inst, configurable: true });
    return inst;
  };

  const ours = (s) => !!s && s.ver === VER && typeof s.apply === 'function';
  const drop = (s) => { try { if (s && typeof s.dispose === 'function') s.dispose(); } catch (e) { /* gone either way */ } };
  try {
    if (!spec || spec.v !== VER) return 'skip:off';
    if (spec.origin != null && spec.origin !== location.origin) return 'skip:origin';  // decision 3
    if (document.readyState !== 'complete') return 'skip:loading';
    const de = document.documentElement, KEY = Symbol.for('refsure.trail');
    if (!de || de.namespaceURI !== 'http://www.w3.org/1999/xhtml') return 'skip:off';
    if (!window.ShadowRoot || !('adoptedStyleSheets' in ShadowRoot.prototype)) return 'skip:sheets';
    let inst = null, s;
    for (const h of de.querySelectorAll(':scope > refsure-trail')) {
      s = h[KEY];
      if (!inst && ours(s)) inst = s; else { drop(s); h.remove(); }
    }
    // The document keeps the instance too: a host the page removed is found here, and its apply re-attaches it.
    s = document[KEY];
    if (!inst && ours(s)) inst = s; else if (s && s !== inst) drop(s);
    if (!inst) Object.defineProperty(document, KEY, { value: inst = build(KEY), configurable: true });
    return inst.apply(spec);
  } catch (e) {
    return 'err:' + (e && typeof e.name === 'string' ? e.name.slice(0, 32) : 'unknown');
  }
})
