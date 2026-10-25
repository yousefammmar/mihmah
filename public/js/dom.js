// Safe element builder: strings always become text nodes, so user content is never parsed as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value' || k === 'checked') el[k] = v;
    // The CSP forbids inline style attributes; CSSOM property writes are allowed.
    else if (k === 'style') for (const decl of String(v).split(';')) { const [p, ...val] = decl.split(':'); if (p.trim()) el.style.setProperty(p.trim(), val.join(':').trim()); }
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

// All user-facing times are shown in Jordan time, whatever the viewer's device timezone.
export const TZ = 'Asia/Amman';
const latn = 'ar-JO-u-nu-latn';
export const fmtJOD = (n) => `${Number(n).toLocaleString(latn, { maximumFractionDigits: 3 })} د.أ`;
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(latn, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(latn, { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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

// YYYY-MM-DD of an instant (default now) in Amman.
export const ammanDate = (iso = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export function todayStr(offset = 0) {
  return ammanDate(Date.now() + offset * 86400_000);
}

// Whole days from today (Amman) until the Amman calendar date of `iso`.
export function daysUntil(iso) {
  const toUtc = (s) => Date.UTC(...s.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((toUtc(ammanDate(iso)) - toUtc(ammanDate())) / 86400_000);
}

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

export function isUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

export const parseList = (text, sep = /\n/) => String(text || '').split(sep).map((s) => s.trim()).filter(Boolean);
export const fmtSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
