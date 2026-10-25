// HttpError carries a stable code for clients and an Arabic message safe to show to users.
export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new HttpError(400, 'validation', message || 'البيانات المرسلة غير صالحة.', fields);
export const unauthorized = (message = 'يجب تسجيل الدخول أولاً.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'لا تملك صلاحية تنفيذ هذا الإجراء.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'العنصر غير موجود.') => new HttpError(404, 'not_found', message);
export const conflict = (code, message) => new HttpError(409, code, message);

// Maps database constraint errors to client errors; everything else becomes a logged 500.
export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    let e = err;
    if (!(e instanceof HttpError)) {
      if (err.type === 'entity.too.large') e = new HttpError(413, 'too_large', 'حجم الطلب أكبر من المسموح.');
      else if (err.type === 'entity.parse.failed') e = badRequest('صيغة البيانات غير صالحة.');
      else if (err.code === '23505') e = conflict('duplicate', 'هذا السجل موجود مسبقاً.');
      else if (err.code === '23514' || err.code === '23502') e = badRequest('القيمة لا تستوفي الشروط المطلوبة.');
      else if (err.code === '23503') e = badRequest('مرجع غير صالح.');
      else if (err.code === '22P02') e = notFound();
    }
    if (!(e instanceof HttpError)) {
      log.error('request.failed', { reqId: req.id, method: req.method, path: req.path, err });
      e = new HttpError(500, 'internal', 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.');
    }
    res.status(e.status).json({ error: { code: e.code, message: e.message, fields: e.fields } });
  };
}

export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
