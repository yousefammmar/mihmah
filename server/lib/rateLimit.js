// Fixed-window in-memory rate limiter.
// ponytail: per-process counters; move to Postgres/Redis when running more than one instance.
import { HttpError } from './errors.js';

export function createRateLimiter() {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 60_000);
  timer.unref();

  function take(key, max, windowMs) {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    entry.count += 1;
    return { ok: entry.count <= max, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }

  // keyFn(req) returns one or more keys; every key must be under its limit.
  function limit(name, max, windowMs, keyFn = (req) => req.ip) {
    return (req, res, next) => {
      const keys = [].concat(keyFn(req)).filter(Boolean);
      for (const k of keys) {
        const r = take(`${name}:${k}`, max, windowMs);
        if (!r.ok) {
          res.set('Retry-After', String(r.retryAfter));
          return next(new HttpError(429, 'rate_limited', `محاولات كثيرة. حاول مجدداً بعد ${Math.ceil(r.retryAfter / 60)} دقيقة.`));
        }
      }
      next();
    };
  }

  return { limit, reset: () => hits.clear() };
}
