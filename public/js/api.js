// API client and the signed-in session. Cookies are HttpOnly (invisible here); the CSRF token is kept in memory.
export const session = { user: null, csrf: null, demoMode: false, payments: { provider: 'none', live: false }, loaded: false };

export class ApiError extends Error {
  constructor(status, body) {
    const e = body?.error || {};
    super(e.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.');
    this.status = status;
    this.code = e.code || 'unknown';
    this.fields = e.fields || null;
  }
}

const listeners = new Set();
export const onSessionChange = (fn) => listeners.add(fn);

export function applySession(data) {
  session.user = data.user ?? null;
  session.csrf = data.csrf ?? null;
  if ('demoMode' in data) session.demoMode = data.demoMode;
  if (data.payments) session.payments = data.payments;
  if ('mailPreview' in data) session.mailPreview = data.mailPreview;
  session.loaded = true;
  listeners.forEach((fn) => fn(session));
}

export async function loadSession() {
  applySession(await api.get('/auth/session'));
  return session;
}

function buildUrl(path, query) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)) : null;
  return `/api${path}${qs && [...qs].length ? `?${qs}` : ''}`;
}

async function request(method, path, body, query) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && session.csrf) headers['X-CSRF-Token'] = session.csrf;
  let res;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { error: { code: 'network', message: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم حاول مجدداً.' } });
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    // Session ended (logout elsewhere, expiry, suspension): forget the local copy and send the user to login.
    if (res.status === 401 && session.user && path !== '/auth/session') {
      applySession({ user: null, csrf: null });
      location.hash = `#/login?next=${encodeURIComponent(location.hash.slice(1) || '/')}`;
    }
    if (err.code === 'csrf') loadSession().catch(() => {});
    throw err;
  }
  return data;
}

export const api = {
  get: (path, query) => request('GET', path, undefined, query),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),

  // Raw-body upload with progress events (XHR is the only browser API that reports upload progress).
  upload(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${path}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      if (session.csrf) xhr.setRequestHeader('X-CSRF-Token', session.csrf);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(xhr.status, data || { error: { message: xhr.status === 413 ? 'الملف أكبر من الحد المسموح.' : 'فشل رفع الملف.' } }));
      };
      xhr.onerror = () => reject(new ApiError(0, { error: { message: 'انقطع الاتصال أثناء رفع الملف. حاول مجدداً.' } }));
      xhr.send(file);
    });
  },
};
