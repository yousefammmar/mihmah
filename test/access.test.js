// Role and ownership checks are enforced by the server, regardless of what the UI shows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, signUp, taskBody, proposal, startProject, uniqueEmail, PASSWORD } from './helpers.js';
import { hashPassword } from '../server/lib/security.js';

let s; let companyA; let companyB; let studentA; let studentB; let ids;
before(async () => {
  s = await startStack();
  companyA = await signUp(s, 'company', { companyName: 'شركة أ' });
  companyB = await signUp(s, 'company', { companyName: 'شركة ب' });
  studentA = await signUp(s, 'student', { name: 'طالب أ' });
  studentB = await signUp(s, 'student', { name: 'طالب ب' });
  ids = await startProject(s, companyA, studentA);
});
after(async () => { await s?.stop(); });

test('role gates: students cannot create tasks, companies cannot apply, non-admins cannot reach /admin', async () => {
  assert.equal((await studentA.post('/api/tasks', taskBody())).status, 403);
  const t = await companyA.post('/api/tasks', taskBody());
  assert.equal((await companyB.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 3 })).status, 403);
  for (const c of [studentA, companyA]) {
    assert.equal((await c.get('/api/admin/overview')).status, 403);
    assert.equal((await c.post(`/api/admin/users/${studentB.userId}/suspend`, { reason: 'محاولة غير مصرّح بها' })).status, 403);
  }
  assert.equal((await s.client().get('/api/tasks')).status, 401);
});

test('a company cannot read or act on another company’s tasks, applicants or offers', async () => {
  const t = await companyA.post('/api/tasks', taskBody());
  const app = await studentB.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 3 });
  assert.equal((await companyB.get(`/api/tasks/${t.data.id}/applications`)).status, 403);
  assert.equal((await companyB.post(`/api/applications/${app.data.id}/offer`, {})).status, 404);
  assert.equal((await companyB.post(`/api/applications/${app.data.id}/reject`)).status, 404);
  assert.equal((await companyB.patch(`/api/tasks/${t.data.id}`, taskBody())).status, 403);
  assert.equal((await companyB.post(`/api/tasks/${t.data.id}/cancel`, { reason: 'ليست مهمتي أصلاً' })).status, 403);
  const offer = await companyA.post(`/api/applications/${app.data.id}/offer`, {});
  assert.equal((await companyB.post(`/api/offers/${offer.data.id}/withdraw`)).status, 404);
});

test('a student cannot act on another student’s application or offer', async () => {
  const t = await companyA.post('/api/tasks', taskBody());
  const app = await studentA.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 3 });
  assert.equal((await studentB.post(`/api/applications/${app.data.id}/withdraw`)).status, 404);
  const offer = await companyA.post(`/api/applications/${app.data.id}/offer`, {});
  assert.equal((await studentB.post(`/api/offers/${offer.data.id}/accept`)).status, 404);
  assert.equal((await studentB.post(`/api/offers/${offer.data.id}/decline`)).status, 404);
  const mine = await studentB.get('/api/me/applications');
  assert.ok(!mine.data.items.some((x) => x.id === app.data.id));
});

test('project workspace, messages and files are private to the two participants', async () => {
  const p = ids.projectId;
  assert.equal((await studentA.get(`/api/projects/${p}`)).status, 200);
  assert.equal((await companyA.get(`/api/projects/${p}`)).status, 200);
  for (const outsider of [studentB, companyB]) {
    assert.equal((await outsider.get(`/api/projects/${p}`)).status, 404);
    assert.equal((await outsider.get(`/api/projects/${p}/messages`)).status, 404);
    assert.equal((await outsider.post(`/api/projects/${p}/messages`, { body: 'تطفّل' })).status, 404);
    assert.equal((await outsider.post(`/api/projects/${p}/deliverables`, { note: 'تسليم مزيّف للاختبار', links: ['https://example.com'] })).status, 404);
  }
  const list = await studentB.get('/api/projects');
  assert.equal(list.data.items.length, 0);
});

test('student portfolios are hidden from other students but visible to companies', async () => {
  assert.equal((await studentB.get(`/api/students/${studentA.userId}`)).status, 403);
  assert.equal((await companyB.get(`/api/students/${studentA.userId}`)).status, 200);
  assert.equal((await studentA.get(`/api/students/${studentA.userId}`)).status, 200);
});

test('drafts are invisible to everyone except their owner', async () => {
  const d = await companyA.post('/api/tasks', taskBody({ publish: false }));
  assert.equal(d.data.status, 'draft');
  assert.equal((await studentA.get(`/api/tasks/${d.data.id}`)).status, 404);
  assert.equal((await companyB.get(`/api/tasks/${d.data.id}`)).status, 404);
  assert.equal((await companyA.get(`/api/tasks/${d.data.id}`)).status, 200);
  assert.equal((await studentA.post(`/api/tasks/${d.data.id}/applications`, { proposal, deliveryDays: 3 })).status, 409);
});

test('admins can inspect projects (audited) and suspension revokes sessions', async () => {
  const email = uniqueEmail('admin');
  await s.sql("insert into users (email, password_hash, role, email_verified_at) values ($1, $2, 'admin', now())", [email, await hashPassword(PASSWORD)]);
  const admin = s.client();
  assert.equal((await admin.post('/api/auth/login', { email, password: PASSWORD })).status, 200);
  assert.equal((await admin.get(`/api/projects/${ids.projectId}`)).status, 200);
  const [ev] = await s.sql("select 1 from audit_events where action = 'admin.project_viewed' and entity_id = $1", [ids.projectId]);
  assert.ok(ev, 'admin view is audited');
  const victim = await signUp(s, 'student');
  assert.equal((await admin.post(`/api/admin/users/${victim.userId}/suspend`, { reason: 'x' })).status, 400, 'reason required');
  assert.equal((await admin.post(`/api/admin/users/${victim.userId}/suspend`, { reason: 'انتحال صفة طالب' })).status, 200);
  assert.equal((await victim.get('/api/me')).status, 401);
  const relog = await s.client().post('/api/auth/login', { email: victim.email, password: PASSWORD });
  assert.equal(relog.status, 403);
  const [act] = await s.sql("select reason from moderation_actions where target_id = $1 and action = 'suspend_user'", [victim.userId]);
  assert.equal(act.reason, 'انتحال صفة طالب');
});

test('verification badge only after an admin verifies the company', async () => {
  const c = await signUp(s, 'company');
  const before = await c.get('/api/auth/session');
  assert.equal(before.data.user.verificationStatus, 'unverified');
  assert.equal((await c.post('/api/me/verification-request')).status, 409, 'profile must be complete first');
  await c.put('/api/me/profile', { companyName: 'مخبز الاختبار', contactName: 'هبة', industry: 'مخابز', city: 'عمّان', bio: 'مخبز صغير يقدّم الخبز الطازج يومياً.' });
  assert.equal((await c.post('/api/me/verification-request')).data.verificationStatus, 'pending');
  const pub = await companyA.get(`/api/companies/${c.userId}`);
  assert.equal(pub.data.verified, false, 'pending is not verified');
});
