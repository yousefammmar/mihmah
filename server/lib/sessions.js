// Server-managed sessions: the cookie holds a random token, the database holds only its SHA-256 hash.
import { randomToken, sha256, safeEqual } from './security.js';
import { unauthorized, forbidden, HttpError } from './errors.js';

export function sessionTools(ctx) {
  const { db, config } = ctx;
  const { cookieName, ttlHours, idleHours, secureCookie } = config.session;

  function setCookie(res, token, expiresAt) {
    res.cookie(cookieName, token, {
      httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/', expires: expiresAt,
    });
  }

  async function create(res, userId, userAgent, client = db) {
    const token = randomToken(32);
    const csrf = randomToken(24);
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
    await client.query(
      'insert into sessions (user_id, token_hash, csrf_token, expires_at, user_agent) values ($1, $2, $3, $4, $5)',
      [userId, sha256(token), csrf, expiresAt, (userAgent || '').slice(0, 200)],
    );
    setCookie(res, token, expiresAt);
    return { csrf, expiresAt };
  }

  function readToken(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === cookieName) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  // Attaches req.user / req.session when the cookie maps to a live session.
  async function load(req, res, next) {
    try {
      const token = readToken(req);
      if (!token) return next();
      const row = await db.one(
        `select s.id as session_id, s.csrf_token, s.last_seen_at, u.id, u.email, u.role, u.status, u.email_verified_at, u.is_demo
           from sessions s join users u on u.id = s.user_id
          where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
            and s.last_seen_at > now() - make_interval(hours => $2)`,
        [sha256(token), idleHours],
      );
      if (!row) { res.clearCookie(cookieName, { path: '/' }); return next(); }
      if (row.status !== 'active') {
        await db.query('update sessions set revoked_at = now() where id = $1', [row.session_id]);
        res.clearCookie(cookieName, { path: '/' });
        return next();
      }
      req.session = { id: row.session_id, csrf: row.csrf_token };
      req.user = { id: row.id, email: row.email, role: row.role, emailVerified: !!row.email_verified_at, isDemo: row.is_demo };
      if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
        db.query('update sessions set last_seen_at = now() where id = $1', [row.session_id]).catch(() => {});
      }
      next();
    } catch (err) { next(err); }
  }

  async function revoke(sessionId) {
    await db.query('update sessions set revoked_at = now() where id = $1 and revoked_at is null', [sessionId]);
  }

  async function revokeAll(userId, client = db, exceptSessionId = null) {
    await client.query(
      'update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2)',
      [userId, exceptSessionId],
    );
  }

  const clear = (res) => res.clearCookie(cookieName, { path: '/' });
  return { create, load, revoke, revokeAll, clear };
}

// CSRF: state-changing requests must come from an allowed Origin, and signed-in requests
// must echo the per-session token in X-CSRF-Token (cookies alone are never enough).
export function csrfGuard(config) {
  const allowed = new Set(config.allowedOrigins);
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return next(new HttpError(403, 'bad_origin', 'تم رفض الطلب: مصدر غير موثوق.'));
    if (req.session && !safeEqual(req.headers['x-csrf-token'] || '', req.session.csrf)) {
      return next(new HttpError(403, 'csrf', 'انتهت صلاحية الصفحة. أعد تحميلها وحاول مجدداً.'));
    }
    next();
  };
}

export const requireUser = (req, res, next) => (req.user ? next() : next(unauthorized()));

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export function requireVerified(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.emailVerified) return next(new HttpError(403, 'email_unverified', 'أكّد بريدك الإلكتروني أولاً لإتمام هذا الإجراء.'));
  next();
}
