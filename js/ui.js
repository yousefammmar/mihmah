// Shared UI pieces: toasts, dialogs, form validation and small presentational components.
import { h, bdi, initials, sleep } from './dom.js';
import { icon } from './icons.js';

// ---------- toasts ----------
export function toast(message, kind = 'success') {
  const region = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}` },
    icon(kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'check'), h('span', null, message));
  region.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 4000);
}

export function reportError(err) {
  toast(err?.message || 'حدث خطأ غير متوقع.', 'error');
}

// ---------- dialogs (native <dialog>: focus trap + Escape handled by the browser) ----------
let dialogSeq = 0;
export function openDialog({ title, description, body, footer, onClose, wide }) {
  const id = `dlg-${++dialogSeq}`;
  const dialog = h('dialog', { class: `dialog${wide ? ' dialog-wide' : ''}`, 'aria-labelledby': `${id}-t`, 'aria-describedby': description ? `${id}-d` : null },
    h('div', { class: 'dialog-head' },
      h('h2', { id: `${id}-t`, class: 'dialog-title' }, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => dialog.close('cancel') }, icon('x'))),
    description && h('p', { id: `${id}-d`, class: 'dialog-desc' }, description),
    body,
    footer && h('div', { class: 'dialog-foot' }, footer));
  const opener = document.activeElement;
  dialog.addEventListener('close', () => {
    onClose?.(dialog.returnValue);
    dialog.remove();
    if (opener && document.contains(opener)) opener.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function confirmDialog({ title, body, confirmLabel = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => dlg.close('ok') }, confirmLabel);
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close('cancel') }, 'إلغاء');
    const dlg = openDialog({
      title,
      body: h('div', { class: 'dialog-body' }, body),
      footer: [cancel, ok],
      onClose: (v) => resolve(v === 'ok'),
    });
    (danger ? cancel : ok).focus(); // destructive actions never start focused
  });
}

// A dialog containing a form. `validate(form)` returns an errors map; resolves with FormData or null.
export function formDialog({ title, description, fields, submitLabel, validate, danger }) {
  return new Promise((resolve) => {
    let result = null;
    const form = h('form', { class: 'dialog-body stack', novalidate: true }, fields);
    const dlg = openDialog({
      title, description, body: form,
      footer: [
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close('cancel') }, 'إلغاء'),
        h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => form.requestSubmit() }, submitLabel),
      ],
      onClose: () => resolve(result),
    });
    liveClear(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!showErrors(form, validate(form))) return;
      result = new FormData(form);
      dlg.close('ok');
    });
    form.querySelector('input, textarea, select')?.focus();
  });
}

// ---------- forms ----------
let fieldSeq = 0;
export function field(label, control, { hint, optional } = {}) {
  const ctrl = control.matches?.('input, select, textarea') ? control : control.querySelector('input, select, textarea');
  const id = ctrl.id || (ctrl.id = `f-${ctrl.name || 'x'}-${++fieldSeq}`);
  const hintEl = hint && h('p', { class: 'field-hint', id: `${id}-hint` }, hint);
  const errEl = h('p', { class: 'field-error', id: `${id}-err`, hidden: true });
  ctrl.setAttribute('aria-describedby', [hintEl && hintEl.id, errEl.id].filter(Boolean).join(' '));
  return h('div', { class: 'field' },
    h('label', { for: id, class: 'field-label' }, label, optional && h('span', { class: 'field-optional' }, ' (اختياري)')),
    control, hintEl, errEl);
}

export const input = (props) => h('input', { class: 'input', ...props });
export const textarea = (props) => h('textarea', { class: 'input textarea', rows: 4, ...props });
export function select(props, options, placeholder) {
  return h('select', { class: 'input select', ...props },
    placeholder && h('option', { value: '' }, placeholder),
    options.map((o) => {
      const [value, label] = Array.isArray(o) ? o : [o, o];
      return h('option', { value, selected: String(props.value ?? '') === String(value) }, label);
    }));
}

// errors: { fieldName: message }. Returns true when there are no errors.
export function showErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((p) => { p.hidden = true; p.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    if (!msg) continue;
    const ctrl = form.querySelector(`[name="${name}"]`);
    if (!ctrl) continue;
    ctrl.setAttribute('aria-invalid', 'true');
    const err = document.getElementById(`${ctrl.id}-err`);
    if (err) { err.textContent = msg; err.hidden = false; }
    first ||= ctrl;
  }
  if (first) {
    first.focus();
    toast('يرجى تصحيح الحقول المشار إليها.', 'error');
  }
  return !first;
}

export function liveClear(form) {
  form.addEventListener('input', (e) => {
    const c = e.target;
    if (c.getAttribute('aria-invalid') !== 'true') return;
    c.removeAttribute('aria-invalid');
    const err = document.getElementById(`${c.id}-err`);
    if (err) err.hidden = true;
  });
}

// Shows a loading state on a button while an async operation runs.
export async function busy(btn, label, fn) {
  const original = [...btn.childNodes];
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), label);
  try {
    await sleep(450); // simulated latency so the loading state is perceivable
    return await fn();
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.replaceChildren(...original);
    }
  }
}

// ---------- presentational ----------
export const badge = (text, tone = 'muted', ico) => h('span', { class: `badge badge-${tone}` }, ico && icon(ico), text);
export const statusBadge = (map, status) => badge(map[status].label, map[status].tone);
export const demoBadge = () => h('span', { class: 'badge badge-demo', title: 'سجل تجريبي ضمن بيانات النموذج الأولي' }, 'تجريبي');

export function skillChips(skills, highlight) {
  return h('ul', { class: 'chips', 'aria-label': 'المهارات' },
    skills.map((s) => h('li', { class: `chip${highlight?.has(s.toLowerCase()) ? ' chip-match' : ''}` },
      highlight?.has(s.toLowerCase()) && icon('check'), bdi(s))));
}

export function emptyState({ ico = 'inbox', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(ico)),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
    action);
}

export function pageHeader({ title, subtitle, actions, eyebrow }) {
  return h('header', { class: 'page-head' },
    h('div', null,
      eyebrow && h('p', { class: 'eyebrow' }, eyebrow),
      h('h1', { class: 'page-title', tabindex: '-1', 'data-page-title': true }, title),
      subtitle && h('p', { class: 'page-sub' }, subtitle)),
    actions && h('div', { class: 'page-actions' }, actions));
}

export const avatar = (name, cls = '') => h('span', { class: `avatar ${cls}`, 'aria-hidden': 'true' }, initials(name));

export function stars(rating) {
  return h('span', { class: 'stars', role: 'img', 'aria-label': `التقييم ${rating} من 5` },
    [1, 2, 3, 4, 5].map((i) => icon('star', i <= rating ? 'star-on' : 'star-off')));
}

export const note = (text, ico = 'info') => h('p', { class: 'note' }, icon(ico), h('span', null, text));

export function extLink(url, label) {
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'ext-link' },
    icon('external'), bdi(label || url, 'ltr'), h('span', { class: 'sr-only' }, ' (يفتح في نافذة جديدة)'));
}

export function stat(label, value, ico, href) {
  const inner = [h('span', { class: 'stat-icon' }, icon(ico)), h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label)];
  return href ? h('a', { class: 'stat card-raised', href: `#${href}` }, inner) : h('div', { class: 'stat card-raised' }, inner);
}

export function section(title, content, { action, ico, id } = {}) {
  const hid = id || `sec-${++fieldSeq}`;
  return h('section', { class: 'panel', 'aria-labelledby': hid },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title', id: hid }, ico && icon(ico), title),
      action),
    content);
}
