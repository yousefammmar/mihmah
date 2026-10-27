// Regression: verification links failed on the live site with "الرابط غير صالح أو انتهت صلاحيته".
// Every resend cancelled the earlier links (Gmail threads them, so the visible email is often an old one),
// and opening a link a second time reported an error although the account was already verified.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startStack, uniqueEmail, PASSWORD } from './helpers.js';

let s;
before(async () => { s = await startStack(); });
after(async () => { await s?.stop(); });

// All verification tokens mailed to an address, oldest first.
async function tokensFor(email) {
  const dir = s.env.DEV_MAIL_DIR;
  const out = [];
  for (const f of (await fs.readdir(dir)).sort()) {
    const m = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
    if (m.to === email) out.push(decodeURIComponent(/token=([^\s]+)/.exec(m.text)[1]));
  }
  return out;
}

test('an earlier verification email still works after a resend, and reopening a link says verified', async () => {
  const email = uniqueEmail('relink');
  const c = s.client();
  await c.post('/api/auth/register', { role: 'student', email, password: PASSWORD, name: 'ليان' });
  assert.equal((await c.post('/api/auth/resend-verification')).status, 200);
  const [first, second] = await tokensFor(email);
  assert.ok(first && second && first !== second, 'two different links were mailed');

  const r = await c.post('/api/auth/verify-email', { token: first });
  assert.equal(r.status, 200, 'the older link must still verify');
  assert.equal((await c.get('/api/auth/session')).data.user.emailVerified, true);

  for (const token of [first, second]) {
    const again = await s.client().post('/api/auth/verify-email', { token });
    assert.equal(again.status, 200, 'reopening a link of a verified account is not an error');
    assert.equal(again.data.alreadyVerified, true);
  }
  const [{ n }] = await s.sql("select count(*)::int as n from audit_events where action = 'user.email_verified' and entity_id = (select id from users where email = $1)", [email]);
  assert.equal(n, 1, 'verification is recorded once');

  const forged = await s.client().post('/api/auth/verify-email', { token: 'not-a-real-token' });
  assert.equal(forged.status, 400);
  assert.equal(forged.data.error.code, 'invalid_token');
});
