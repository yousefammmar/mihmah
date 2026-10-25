import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, signUp, uniqueEmail, PASSWORD, ORIGIN } from './helpers.js';

let s;
before(async () => { s = await startStack(); });
after(async () => { await s?.stop(); });

test('registration sets an HttpOnly session cookie and stores only a hashed password', async () => {
  const c = s.client();
  const email = uniqueEmail('reg');
  const r = await c.post('/api/auth/register', { role: 'student', email, password: PASSWORD, name: 'ليان' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.email, email);
  assert.equal(r.data.user.emailVerified, false);
  const cookie = r.headers.getSetCookie().join(';');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const [row] = await s.sql('select password_hash from users where email = $1', [email]);
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes(PASSWORD));
  const [sess] = await s.sql('select token_hash from sessions s join users u on u.id = s.user_id where u.email = $1', [email]);
  assert.ok(!cookie.includes(Buffer.from(sess.token_hash).toString('hex')), 'cookie value is not the stored hash');
});

test('registration validation: duplicate email and weak password give field errors', async () => {
  const c = await signUp(s, 'student');
  const dup = await s.client().post('/api/auth/register', { role: 'student', email: c.email.toUpperCase(), password: PASSWORD, name: 'آخر' });
  assert.equal(dup.status, 400);
  assert.ok(dup.data.error.fields.email);
  const weak = await s.client().post('/api/auth/register', { role: 'student', email: uniqueEmail('weak'), password: 'short', name: 'آخر' });
  assert.equal(weak.status, 400);
  assert.ok(weak.data.error.fields.password);
  const admin = await s.client().post('/api/auth/register', { role: 'admin', email: uniqueEmail('adm'), password: PASSWORD, name: 'x' });
  assert.equal(admin.status, 400, 'admin accounts cannot self-register');
});

test('login: same error for unknown email and wrong password; success creates a session', async () => {
  const c = await signUp(s, 'company');
  const a = await s.client().post('/api/auth/login', { email: c.email, password: 'wrong password!!' });
  const b = await s.client().post('/api/auth/login', { email: uniqueEmail('nobody'), password: 'wrong password!!' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.data.error.message, b.data.error.message);
  const ok = s.client();
  const r = await ok.post('/api/auth/login', { email: c.email, password: PASSWORD });
  assert.equal(r.status, 200);
  assert.ok(r.data.csrf);
  assert.equal((await ok.get('/api/me')).status, 200);
});

test('login is rate limited per email', async () => {
  const c = await signUp(s, 'student');
  let last;
  for (let i = 0; i < 9; i++) last = await s.client().post('/api/auth/login', { email: c.email, password: 'definitely wrong' });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('logout revokes the session server-side (a copied cookie stops working)', async () => {
  const c = await signUp(s, 'student');
  const stolen = new Map(c.cookies);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  const replay = s.client();
  replay.cookies = stolen;
  assert.equal((await replay.get('/api/me')).status, 401);
});

test('CSRF: signed-in writes need the per-session token and an allowed Origin', async () => {
  const c = await signUp(s, 'student');
  const noToken = await c.put('/api/me/notification-preferences', { messages: true }, { noCsrf: true });
  assert.equal(noToken.status, 403);
  assert.equal(noToken.data.error.code, 'csrf');
  const badOrigin = await c.put('/api/me/notification-preferences', { messages: true }, { origin: 'https://evil.example' });
  assert.equal(badOrigin.status, 403);
  const noOrigin = await c.put('/api/me/notification-preferences', { messages: true }, { origin: null });
  assert.equal(noOrigin.status, 403);
  const ok = await c.put('/api/me/notification-preferences', { messages: true, offers: true, applications: true, projects: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.messages, true);
});

test('email verification token is single-use; unverified users cannot apply', async () => {
  const email = uniqueEmail('verify');
  const c = s.client();
  await c.post('/api/auth/register', { role: 'student', email, password: PASSWORD, name: 'سارة' });
  const token = await s.tokenFor(email);
  assert.equal((await c.post('/api/auth/verify-email', { token })).status, 200);
  const again = await c.post('/api/auth/verify-email', { token });
  assert.equal(again.status, 400);
  assert.equal(again.data.error.code, 'invalid_token');
  assert.equal((await c.get('/api/auth/session')).data.user.emailVerified, true);
});

test('password reset: generic answer, single-use token, revokes every existing session', async () => {
  const c = await signUp(s, 'company');
  const other = s.client();
  await other.post('/api/auth/login', { email: c.email, password: PASSWORD });
  const unknown = await s.client().post('/api/auth/forgot-password', { email: uniqueEmail('ghost') });
  const known = await s.client().post('/api/auth/forgot-password', { email: c.email });
  assert.equal(unknown.status, 200);
  assert.equal(known.data.message, unknown.data.message);
  const token = await s.tokenFor(c.email);
  const newPw = 'a brand new passphrase';
  assert.equal((await s.client().post('/api/auth/reset-password', { token, password: newPw })).status, 200);
  assert.equal((await s.client().post('/api/auth/reset-password', { token, password: newPw })).status, 400);
  assert.equal((await c.get('/api/me')).status, 401, 'old session revoked');
  assert.equal((await other.get('/api/me')).status, 401, 'other device revoked');
  assert.equal((await s.client().post('/api/auth/login', { email: c.email, password: PASSWORD })).status, 401);
  assert.equal((await s.client().post('/api/auth/login', { email: c.email, password: newPw })).status, 200);
});

test('expired and idle sessions are rejected', async () => {
  const c = await signUp(s, 'student');
  await s.sql("update sessions set expires_at = now() - interval '1 minute' where user_id = $1", [c.userId]);
  assert.equal((await c.get('/api/me')).status, 401);
  const d = await signUp(s, 'student');
  await s.sql("update sessions set last_seen_at = now() - interval '3 days' where user_id = $1", [d.userId]);
  assert.equal((await d.get('/api/me')).status, 401);
});

test('users can list and revoke their other sessions', async () => {
  const c = await signUp(s, 'student');
  const phone = s.client();
  await phone.post('/api/auth/login', { email: c.email, password: PASSWORD });
  const list = await c.get('/api/auth/sessions');
  assert.equal(list.data.items.length, 2);
  assert.equal((await c.post('/api/auth/logout-others')).status, 200);
  assert.equal((await phone.get('/api/me')).status, 401);
  assert.equal((await c.get('/api/me')).status, 200);
});

test('security headers and restricted CORS', async () => {
  const res = await fetch(`${s.base}/api/auth/session`, { headers: { origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const allowed = await fetch(`${s.base}/api/auth/session`, { headers: { origin: ORIGIN } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
  const health = await fetch(`${s.base}/readyz`);
  assert.equal((await health.json()).db, 'ok');
});
