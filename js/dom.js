// Safe element builder: strings always become text nodes, so user content is never parsed as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value' || k === 'checked') el[k] = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Isolates English skills, URLs and numbers inside RTL text.
export const bdi = (text, dir = 'auto') => h('bdi', { dir }, text);

const latn = 'ar-JO-u-nu-latn';
export const fmtJOD = (n) => `${Number(n).toLocaleString(latn)} د.أ`;
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(latn, { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(latn, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function fmtDays(n) {
  n = Number(n);
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

const rtf = new Intl.RelativeTimeFormat(latn, { numeric: 'auto' });
export function fmtRelative(iso) {
  const diff = (new Date(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'الآن';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(iso);
}

// Days from today until an ISO date (date-only strings are treated as local dates).
export function daysUntil(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

export function todayStr(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

export function isUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

export const parseList = (text, sep = /\n/) => text.split(sep).map((s) => s.trim()).filter(Boolean);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
