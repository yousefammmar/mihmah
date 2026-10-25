// Demo login. Mounted only when DEMO_MODE=true (a separate demo environment with its own database).
// It can only sign into accounts flagged is_demo, so it never touches real users.
import express from 'express';
import { asyncRoute, notFound } from '../lib/errors.js';
import { validator } from '../lib/validate.js';
import { accountSummary } from './auth.js';

const DEMO_EMAILS = {
  student: 'lian@student.example.com',
  company: 'cafe@company.example.com',
  admin: 'admin@mihmah.example.com',
};

export default function demoRoutes(ctx) {
  const { db, sessions, limiter } = ctx;
  const r = express.Router();

  r.post('/login', limiter.limit('demo', 60, 3600_000), asyncRoute(async (req, res) => {
    const { account } = validator(req.body).oneOf('account', Object.keys(DEMO_EMAILS), { label: 'الحساب التجريبي' }).done();
    const user = await db.one("select id from users where lower(email) = $1 and is_demo and status = 'active'", [DEMO_EMAILS[account]]);
    if (!user) throw notFound('الحساب التجريبي غير موجود. شغّل بيانات العرض (npm run seed:dev).');
    if (req.session) await sessions.revoke(req.session.id);
    const { csrf } = await sessions.create(res, user.id, req.headers['user-agent']);
    res.json({ user: await accountSummary(db, user.id), csrf, demoMode: true });
  }));

  return r;
}

export { DEMO_EMAILS };
