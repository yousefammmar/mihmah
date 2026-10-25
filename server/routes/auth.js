import express from 'express';
import { asyncRoute, HttpError, badRequest, notFound } from '../lib/errors.js';
import { validator } from '../lib/validate.js';
import { hashPassword, verifyPassword, burnPasswordCheck, randomToken, sha256 } from '../lib/security.js';
import { requireUser } from '../lib/sessions.js';
import { templates } from '../lib/mailer.js';
import { audit } from '../lib/activity.js';

const HOUR = 3600_000;

// Public summary of the signed-in account used by the frontend shell.
export async function accountSummary(db, userId) {
  return db.one(
    `select u.id, u.email, u.role, u.is_demo as "isDemo", (u.email_verified_at is not null) as "emailVerified",
            coalesce(sp.full_name, cp.company_name, 'مسؤول المنصة') as name,
            cp.contact_name as "contactName", cp.verification_status as "verificationStatus"
       from users u
       left join student_profiles sp on sp.user_id = u.id
       left join company_profiles cp on cp.user_id = u.id
      where u.id = $1`,
    [userId],
  );
}

export default function authRoutes(ctx) {
  const { db, config, mailer, limiter, sessions } = ctx;
  const r = express.Router();
  const ipKey = (req) => req.ip;
  const emailKey = (req) => String(req.body?.email || '').trim().toLowerCase();

  // A mail outage must not break the request; the user can ask for the link again.
  async function sendSafe(message) {
    try { await mailer.send(message); return true; } catch (err) { ctx.log.error('mail.failed', { err }); return false; }
  }

  async function issueEmailToken(client, userId, purpose, ttlMs) {
    const token = randomToken(32);
    await client.query("update email_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null", [userId, purpose]);
    await client.query('insert into email_tokens (user_id, purpose, token_hash, expires_at) values ($1, $2, $3, $4)', [userId, purpose, sha256(token), new Date(Date.now() + ttlMs)]);
    return token;
  }

  // Tokens travel in the URL fragment, which browsers never send to servers or in Referer headers.
  const linkFor = (route, token) => `${config.appUrl}/#/${route}?token=${encodeURIComponent(token)}`;

  async function consumeToken(client, token, purpose) {
    const row = (await client.query(
      `update email_tokens set used_at = now()
        where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
        returning user_id`,
      [sha256(String(token || '')), purpose],
    )).rows[0];
    if (!row) throw new HttpError(400, 'invalid_token', 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.');
    return row.user_id;
  }

  const sessionPayload = async (req, csrf) => ({
    user: req.user ? await accountSummary(db, req.user.id) : null,
    csrf: csrf ?? req.session?.csrf ?? null,
    demoMode: config.demoMode,
    payments: { provider: ctx.payments.provider, live: false },
    // Development only: where the local outbox can be read (never set in production).
    mailPreview: !config.isProd && mailer.provider === 'dev' ? '/dev/mail' : null,
  });

  r.get('/session', asyncRoute(async (req, res) => res.json(await sessionPayload(req))));

  r.post('/register', limiter.limit('register', 10, HOUR, ipKey), asyncRoute(async (req, res) => {
    const v = validator(req.body).oneOf('role', ['student', 'company'], { label: 'نوع الحساب' }).email('email').password('password');
    if (req.body?.role === 'company') v.str('companyName', { min: 2, max: 120, label: 'اسم الشركة' }).str('name', { min: 2, max: 100, label: 'اسم المسؤول' });
    else v.str('name', { min: 2, max: 100, label: 'الاسم الكامل' });
    v.check(String(req.body?.password || '').toLowerCase() !== String(req.body?.email || '').toLowerCase(), 'password', 'لا تستخدم بريدك ككلمة مرور.');
    const data = v.done();

    const exists = await db.one('select 1 from users where lower(email) = $1', [data.email]);
    if (exists) throw badRequest('هذا البريد مسجّل مسبقاً.', { email: 'هذا البريد مسجّل مسبقاً. سجّل الدخول أو استعد كلمة المرور.' });

    const passwordHash = await hashPassword(data.password);
    const { userId, token } = await db.tx(async (client) => {
      const user = (await client.query('insert into users (email, password_hash, role) values ($1, $2, $3) returning id', [data.email, passwordHash, data.role])).rows[0];
      if (data.role === 'student') await client.query('insert into student_profiles (user_id, full_name) values ($1, $2)', [user.id, data.name]);
      else await client.query('insert into company_profiles (user_id, company_name, contact_name) values ($1, $2, $3)', [user.id, data.companyName, data.name]);
      await client.query('insert into notification_preferences (user_id) values ($1)', [user.id]);
      await audit(client, { actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, metadata: { role: data.role } });
      return { userId: user.id, token: await issueEmailToken(client, user.id, 'verify_email', 24 * HOUR) };
    });
    await sendSafe({ to: data.email, ...templates.verifyEmail(linkFor('verify-email', token)) });
    const { csrf } = await sessions.create(res, userId, req.headers['user-agent']);
    req.user = { id: userId };
    res.status(201).json(await sessionPayload(req, csrf));
  }));

  r.post('/login',
    limiter.limit('login-ip', 30, 15 * 60_000, ipKey),
    limiter.limit('login-email', 8, 15 * 60_000, emailKey),
    asyncRoute(async (req, res) => {
      const { email, password } = validator(req.body).email('email').str('password', { max: 200, label: 'كلمة المرور' }).done();
      const user = await db.one('select id, password_hash, status from users where lower(email) = $1', [email]);
      const ok = user ? await verifyPassword(password, user.password_hash) : await burnPasswordCheck(password);
      if (!ok) throw new HttpError(401, 'bad_credentials', 'البريد أو كلمة المرور غير صحيحة.');
      if (user.status !== 'active') throw new HttpError(403, 'suspended', 'هذا الحساب موقوف. تواصل مع إدارة المنصة.');
      const { csrf } = await sessions.create(res, user.id, req.headers['user-agent']);
      await audit(db, { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id });
      req.user = { id: user.id };
      res.json(await sessionPayload(req, csrf));
    }));

  r.post('/logout', asyncRoute(async (req, res) => {
    if (req.session) await sessions.revoke(req.session.id);
    sessions.clear(res);
    res.json({ ok: true });
  }));

  r.get('/sessions', requireUser, asyncRoute(async (req, res) => {
    const { rows } = await db.query(
      `select id, created_at as "createdAt", last_seen_at as "lastSeenAt", expires_at as "expiresAt", user_agent as "userAgent", (id = $2) as current
         from sessions where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc`,
      [req.user.id, req.session.id],
    );
    res.json({ items: rows });
  }));

  r.delete('/sessions/:id', requireUser, asyncRoute(async (req, res) => {
    const { rowCount } = await db.query('update sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null', [req.params.id, req.user.id]);
    if (!rowCount) throw notFound('الجلسة غير موجودة.');
    if (req.params.id === req.session.id) sessions.clear(res);
    res.json({ ok: true });
  }));

  r.post('/logout-others', requireUser, asyncRoute(async (req, res) => {
    await sessions.revokeAll(req.user.id, db, req.session.id);
    res.json({ ok: true });
  }));

  r.post('/verify-email', limiter.limit('verify', 20, HOUR, ipKey), asyncRoute(async (req, res) => {
    const userId = await db.tx(async (client) => {
      const id = await consumeToken(client, req.body?.token, 'verify_email');
      await client.query('update users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1', [id]);
      await audit(client, { actorId: id, action: 'user.email_verified', entityType: 'user', entityId: id });
      return id;
    });
    res.json({ ok: true, userId });
  }));

  r.post('/resend-verification', requireUser, limiter.limit('resend', 3, HOUR, (req) => req.user.id), asyncRoute(async (req, res) => {
    if (req.user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    const token = await db.tx((client) => issueEmailToken(client, req.user.id, 'verify_email', 24 * HOUR));
    if (!(await sendSafe({ to: req.user.email, ...templates.verifyEmail(linkFor('verify-email', token)) }))) {
      throw new HttpError(503, 'mail_unavailable', 'تعذّر إرسال البريد حالياً. حاول بعد قليل.');
    }
    res.json({ ok: true });
  }));

  // Always answers the same way so the endpoint does not reveal which emails are registered.
  r.post('/forgot-password',
    limiter.limit('forgot-ip', 10, HOUR, ipKey),
    limiter.limit('forgot-email', 3, HOUR, emailKey),
    asyncRoute(async (req, res) => {
      const { email } = validator(req.body).email('email').done();
      const user = await db.one("select id from users where lower(email) = $1 and status = 'active'", [email]);
      if (user) {
        const token = await db.tx((client) => issueEmailToken(client, user.id, 'reset_password', HOUR));
        await sendSafe({ to: email, ...templates.resetPassword(linkFor('reset-password', token)) });
      }
      res.json({ ok: true, message: 'إذا كان البريد مسجّلاً فستصلك رسالة تحتوي رابط إعادة التعيين خلال دقائق.' });
    }));

  r.post('/reset-password', limiter.limit('reset', 10, HOUR, ipKey), asyncRoute(async (req, res) => {
    const { password } = validator(req.body).password('password').done();
    const hash = await hashPassword(password);
    await db.tx(async (client) => {
      const id = await consumeToken(client, req.body?.token, 'reset_password');
      // Receiving the email proves inbox ownership, so the address counts as verified.
      await client.query('update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1', [id, hash]);
      await sessions.revokeAll(id, client);
      await audit(client, { actorId: id, action: 'auth.password_reset', entityType: 'user', entityId: id });
    });
    sessions.clear(res);
    res.json({ ok: true });
  }));

  r.post('/change-password', requireUser, limiter.limit('change-pw', 10, HOUR, (req) => req.user.id), asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = validator(req.body).str('currentPassword', { max: 200, label: 'كلمة المرور الحالية' }).password('newPassword').done();
    const user = await db.one('select password_hash from users where id = $1', [req.user.id]);
    if (!(await verifyPassword(currentPassword, user.password_hash))) throw badRequest('كلمة المرور الحالية غير صحيحة.', { currentPassword: 'كلمة المرور الحالية غير صحيحة.' });
    const hash = await hashPassword(newPassword);
    await db.tx(async (client) => {
      await client.query('update users set password_hash = $2, updated_at = now() where id = $1', [req.user.id, hash]);
      await sessions.revokeAll(req.user.id, client, req.session.id);
      await audit(client, { actorId: req.user.id, action: 'auth.password_changed', entityType: 'user', entityId: req.user.id });
    });
    res.json({ ok: true });
  }));

  return r;
}
