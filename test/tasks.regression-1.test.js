// Regression: ISSUE-001 — a suspended company's tasks stayed open to students (detail 200, apply 201)
// Found by /qa on 2026-10-25
// Report: .gstack/qa-reports/run-20261025T160958Z/qa-report-localhost-2026-10-25.md
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, signUp, taskBody, proposal, uniqueEmail, PASSWORD } from './helpers.js';
import { hashPassword } from '../server/lib/security.js';

let s; let company; let student; let admin;
before(async () => {
  s = await startStack();
  company = await signUp(s, 'company');
  student = await signUp(s, 'student');
  const email = uniqueEmail('admin');
  await s.sql("insert into users (email, password_hash, role, email_verified_at) values ($1, $2, 'admin', now())", [email, await hashPassword(PASSWORD)]);
  admin = s.client();
  await admin.post('/api/auth/login', { email, password: PASSWORD });
});
after(async () => { await s?.stop(); });

test('a suspended company’s published task cannot be opened, applied to or accepted by students', async () => {
  const open = await company.post('/api/tasks', taskBody());
  const offered = await company.post('/api/tasks', taskBody());
  const app = await student.post(`/api/tasks/${offered.data.id}/applications`, { proposal, deliveryDays: 5 });
  const offer = await company.post(`/api/applications/${app.data.id}/offer`, {});
  assert.equal(offer.status, 201);

  assert.equal((await admin.post(`/api/admin/users/${company.userId}/suspend`, { reason: 'حساب احتيالي في اختبار الانحدار' })).status, 200);

  assert.equal((await student.get(`/api/tasks/${open.data.id}`)).status, 404, 'task detail must not be public');
  const apply = await student.post(`/api/tasks/${open.data.id}/applications`, { proposal, deliveryDays: 5 });
  assert.equal(apply.status, 409);
  assert.equal(apply.data.error.code, 'task_closed');
  const [{ n }] = await s.sql('select count(*)::int as n from applications where task_id = $1', [open.data.id]);
  assert.equal(n, 0, 'no application row may be created');

  const accept = await student.post(`/api/offers/${offer.data.id}/accept`);
  assert.equal(accept.status, 409, 'an offer from a suspended company cannot start a project');
  const projects = await s.sql('select id from projects where task_id = $1', [offered.data.id]);
  assert.equal(projects.length, 0);

  assert.equal((await student.get(`/api/tasks/${offered.data.id}`)).status, 200, 'a student with an application can still see its history');
});
