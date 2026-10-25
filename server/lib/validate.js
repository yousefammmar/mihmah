// Minimal field validation that collects Arabic messages per field for inline display.
// Labels come in both grammatical genders, so messages are phrased to need no agreement with the label.
import { badRequest } from './errors.js';

export function validator(input = {}) {
  const fields = {};
  const out = {};
  const fail = (name, msg) => { fields[name] ||= msg; };
  const raw = (name) => (input == null ? undefined : input[name]);

  const api = {
    str(name, { min = 0, max = 10000, required = true, label = 'الحقل' } = {}) {
      const v = raw(name);
      if (v == null || v === '') {
        if (required) fail(name, `يرجى إدخال ${label}.`);
        else out[name] = null;
        return api;
      }
      if (typeof v !== 'string') { fail(name, `قيمة ${label} غير صالحة.`); return api; }
      const s = v.trim();
      if (s.length < min) fail(name, `عدد أحرف ${label} أقل من الحد الأدنى: ${s.length} من ${min}.`);
      else if (s.length > max) fail(name, `عدد أحرف ${label} يتجاوز الحد الأقصى (${max}).`);
      else if (required && !s) fail(name, `يرجى إدخال ${label}.`);
      out[name] = s || null;
      return api;
    },
    email(name) {
      const v = typeof raw(name) === 'string' ? raw(name).trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 254) fail(name, 'أدخل بريداً إلكترونياً صحيحاً.');
      out[name] = v;
      return api;
    },
    password(name) {
      const v = raw(name);
      if (typeof v !== 'string' || v.length < 10) fail(name, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
      else if (v.length > 200) fail(name, 'كلمة المرور طويلة جداً.');
      out[name] = v;
      return api;
    },
    int(name, { min, max, required = true, label = 'القيمة' } = {}) {
      const v = raw(name);
      if (v == null || v === '') {
        if (required) fail(name, `يرجى إدخال ${label}.`);
        else out[name] = null;
        return api;
      }
      const n = Number(v);
      if (!Number.isInteger(n) || (min != null && n < min) || (max != null && n > max)) fail(name, `يجب أن تكون قيمة ${label} رقماً صحيحاً بين ${min} و${max}.`);
      out[name] = n;
      return api;
    },
    url(name, { required = false, label = 'الرابط' } = {}) {
      const v = raw(name);
      if (v == null || v === '') {
        if (required) fail(name, `${label} مطلوب.`);
        out[name] = null;
        return api;
      }
      if (!isHttpUrl(v)) fail(name, `${label} يجب أن يكون رابطاً كاملاً يبدأ بـ https://`);
      out[name] = typeof v === 'string' ? v.trim() : null;
      return api;
    },
    oneOf(name, values, { label = 'القيمة', required = true } = {}) {
      const v = raw(name);
      if ((v == null || v === '') && !required) { out[name] = null; return api; }
      if (!values.includes(v)) fail(name, `اختر ${label} من الخيارات المتاحة.`);
      out[name] = v;
      return api;
    },
    list(name, { min = 0, max = 20, itemMax = 200, label = 'القائمة', itemCheck } = {}) {
      const v = raw(name);
      const arr = Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : null;
      if (!arr) { fail(name, `قيمة ${label} غير صالحة.`); return api; }
      if (arr.length < min) fail(name, `عدد عناصر ${label} أقل من الحد الأدنى (${min}).`);
      else if (arr.length > max) fail(name, `عدد عناصر ${label} يتجاوز الحد الأقصى (${max}).`);
      else if (arr.some((x) => x.length > itemMax)) fail(name, `أحد عناصر ${label} طويل جداً.`);
      else if (itemCheck && arr.some((x) => !itemCheck(x))) fail(name, `أحد عناصر ${label} غير صالح.`);
      out[name] = arr;
      return api;
    },
    bool(name) {
      out[name] = raw(name) === true;
      return api;
    },
    check(cond, name, msg) {
      if (!cond) fail(name, msg);
      return api;
    },
    done() {
      if (Object.keys(fields).length) throw badRequest('يرجى تصحيح الحقول المشار إليها.', fields);
      return out;
    },
  };
  return api;
}

export function isHttpUrl(value) {
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

export const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function page(query, maxSize = 50) {
  const size = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 12, 1), maxSize);
  const p = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  return { limit: size, offset: (p - 1) * size, page: p, pageSize: size };
}

export const paged = (rows, pg, total) => ({ items: rows, page: pg.page, pageSize: pg.pageSize, total, pages: Math.max(1, Math.ceil(total / pg.pageSize)) });
