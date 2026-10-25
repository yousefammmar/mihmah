// Express application factory. All dependencies arrive through ctx so tests can build isolated instances.
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { errorHandler, notFound } from './lib/errors.js';
import { sessionTools, csrfGuard } from './lib/sessions.js';
import { escapeHtml } from './lib/mailer.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import taskRoutes from './routes/tasks.js';
import projectRoutes from './routes/projects.js';
import inboxRoutes from './routes/inbox.js';
import adminRoutes from './routes/admin.js';
import demoRoutes from './routes/demo.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(ctx) {
  const { config, log, db } = ctx;
  ctx.sessions = sessionTools(ctx);
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // Request id + access log (method, path without query string, status, duration, user id).
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path.startsWith('/api/events')) return;
      log.info('http', {
        reqId: req.id, method: req.method, path: req.path, status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1_000_000n), userId: req.user?.id,
      });
    });
    next();
  });

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (config.isProd) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // CORS: only explicitly allowed origins (the app itself is same-origin and needs none).
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });
      if (req.method === 'OPTIONS') {
        res.set({ 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token,X-File-Name' });
        return res.sendStatus(204);
      }
    }
    next();
  });

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (req, res) => {
    try {
      await db.query('select 1');
      res.json({ status: 'ready', db: 'ok', mail: ctx.mailer.provider, storage: ctx.storage.driver, payments: ctx.payments.provider });
    } catch {
      res.status(503).json({ status: 'unavailable', db: 'error' });
    }
  });

  app.use('/api', express.json({ limit: '100kb', type: 'application/json' }));
  app.use(ctx.sessions.load);
  app.use('/api', csrfGuard(config));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.use('/api/auth', authRoutes(ctx));
  app.use('/api', profileRoutes(ctx));
  app.use('/api', taskRoutes(ctx));
  app.use('/api', projectRoutes(ctx));
  app.use('/api', inboxRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  if (config.demoMode) app.use('/api/demo', demoRoutes(ctx));
  app.use('/api', (req, res, next) => next(notFound('المسار غير موجود.')));

  // Development mail outbox viewer.
  if (!config.isProd && ctx.mailer.list) {
    app.get('/dev/mail', async (req, res) => {
      const mails = await ctx.mailer.list();
      const items = mails.map((m) => {
        const links = [...String(m.text).matchAll(/https?:\/\/\S+/g)].map((x) => `<a href="${escapeHtml(x[0])}">${escapeHtml(x[0])}</a>`).join('<br>');
        return `<li><b>${escapeHtml(m.subject)}</b> → ${escapeHtml(m.to)} <small>${escapeHtml(m.at)}</small><br>${links}</li>`;
      }).join('');
      res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Dev mail</title><body style="font-family:sans-serif;padding:20px"><h1>Development outbox (not sent)</h1><ul>${items || '<li>Empty</li>'}</ul>`);
    });
  }

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: config.isProd ? '1h' : 0 }));
  app.use(errorHandler(log));
  return app;
}
