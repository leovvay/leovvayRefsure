// Bench beacons for the N12 fixtures (synthetic pages only). Logs every activation of an interactive control and
// every field change with its final value to POST /log, and exposes window.benchEvent(ev) so a page can beacon its
// own effects (search, saved, validation, export_started, report_ready). The fixture server adds the run id.
(function () {
  'use strict';
  var ACTIVATE = 'button, a[href], summary, input[type=button], input[type=submit], input[type=reset], ' +
    'input[type=image], input[type=checkbox], input[type=radio], [role=button], [role=link], [role=menuitem], ' +
    '[role=menuitemcheckbox], [role=menuitemradio], [role=checkbox], [role=switch], [role=radio], [role=tab], ' +
    '[role=option]';
  var NOT_FIELDS = { button: 1, submit: 1, reset: 1, image: 1, checkbox: 1, radio: 1, hidden: 1, file: 1 };
  var FIELD_IDLE_MS = 150;

  function send(ev) {
    var body = JSON.stringify(Object.assign({ page: location.pathname }, ev));
    try { if (navigator.sendBeacon('/log', body)) return; } catch (e) { /* fall through */ }
    try { fetch('/log', { method: 'POST', body: body, keepalive: true }); } catch (e) { /* no log */ }
  }
  window.benchEvent = send;

  function squash(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

  function textWithoutFields(node) {
    var copy = node.cloneNode(true);
    var inner = copy.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inner.length; i++) inner[i].remove();
    return squash(copy.textContent);
  }

  function nameOf(el) {
    var label = el.getAttribute('aria-label');
    if (label && squash(label)) return squash(label);
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      var parts = by.split(/\s+/).map(function (id) {
        var ref = document.getElementById(id);
        return ref ? textWithoutFields(ref) : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) {
        return squash(el.value) || (type === 'submit' ? 'Submit' : '');
      }
      if (el.labels && el.labels.length) return textWithoutFields(el.labels[0]);
      return squash(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name'));
    }
    if (tag === 'form') return squash(el.getAttribute('title'));
    return squash(el.textContent) || squash(el.getAttribute('title'));
  }

  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit.split(/\s+/)[0];
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'select') return el.multiple ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'summary') return 'button';
    if (tag === 'input') {
      if (type === 'checkbox' || type === 'radio') return type;
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    }
    return tag === 'button' ? 'button' : tag;
  }

  // Fields: one `fill` line per settled value (idle, change, blur, or any later activation flushes it), never a
  // line per keystroke, and never the same value twice in a row for one field. Password values are not logged.
  var pending = new Map();
  var logged = new WeakMap();

  function fieldOf(target) {
    if (!(target instanceof Element)) return null;
    var tag = target.tagName.toLowerCase();
    if (tag === 'select' || tag === 'textarea') return target;
    if (tag === 'input') return NOT_FIELDS[(target.getAttribute('type') || 'text').toLowerCase()] ? null : target;
    return target.closest('[contenteditable=""], [contenteditable=true]');
  }

  function valueOf(field) {
    var tag = field.tagName.toLowerCase();
    if (tag === 'select') {
      return Array.prototype.map.call(field.selectedOptions, function (o) { return squash(o.textContent); }).join(', ');
    }
    if (tag === 'input' || tag === 'textarea') return field.value;
    return squash(field.textContent);
  }

  function flush(field) {
    var entry = pending.get(field);
    if (!entry) return;
    pending.delete(field);
    clearTimeout(entry.timer);
    var value = valueOf(field);
    if (logged.has(field) && logged.get(field) === value) return;
    logged.set(field, value);
    var secret = (field.getAttribute('type') || '').toLowerCase() === 'password';
    var ev = { event: 'fill', field: nameOf(field), value: secret ? null : value };
    if (field.getAttribute('name')) ev.fieldName = field.getAttribute('name');
    if (secret) ev.masked = true;
    send(ev);
  }

  function flushAll() { Array.from(pending.keys()).forEach(flush); }

  function touched(event, now) {
    var field = fieldOf(event.target);
    if (!field) return;
    var entry = pending.get(field);
    if (entry) clearTimeout(entry.timer);
    pending.set(field, { timer: setTimeout(function () { flush(field); }, FIELD_IDLE_MS) });
    if (now) flush(field);
  }

  document.addEventListener('input', function (e) { touched(e, false); }, true);
  document.addEventListener('change', function (e) { touched(e, true); }, true);
  document.addEventListener('focusout', function (e) { var f = fieldOf(e.target); if (f) flush(f); }, true);

  // Activations: logged in the capture phase, after pending fills, so a fill line precedes the press it led to.
  document.addEventListener('click', function (e) {
    flushAll();
    var el = e.target instanceof Element ? e.target.closest(ACTIVATE) : null;
    if (!el) return;
    send({ event: 'control', kind: roleOf(el), name: nameOf(el) });
  }, true);

  document.addEventListener('submit', function (e) {
    flushAll();
    var form = e.target instanceof Element ? e.target : null;
    if (form) send({ event: 'control', kind: 'submit', name: nameOf(form) });
  }, true);

  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushAll(); });
})();
