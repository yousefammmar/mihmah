// Server-side state machine validation for tasks, applications, offers, projects and payments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, signUp, taskBody, proposal, startProject } from './helpers.js';

let s; let company; let student; let student2;
before(async () => {
  s = await startStack();
  company = await signUp(s, 'company');
  student = await signUp(s, 'student');
  student2 = await signUp(s, 'student');
});
after(async () => { await s?.stop(); });

test('duplicate applications are rejected, also after withdrawal', async () => {
  const t = await company.post('/api/tasks', taskBody());
  const a = await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  assert.equal(a.status, 201);
  const dup = await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, 'duplicate_application');
  assert.equal((await student.post(`/api/applications/${a.data.id}/withdraw`)).status, 200);
  assert.equal((await student.post(`/api/applications/${a.data.id}/withdraw`)).status, 409, 'cannot withdraw twice');
  assert.equal((await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 })).status, 409);
  const [{ n }] = await s.sql('select count(*)::int as n from applications where task_id = $1', [t.data.id]);
  assert.equal(n, 1);
});

test('applications to cancelled, assigned or expired tasks are rejected', async () => {
  const t = await company.post('/api/tasks', taskBody());
  await company.post(`/api/tasks/${t.data.id}/cancel`, { reason: 'تغيّرت الخطة' });
  const closed = await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  assert.equal(closed.status, 409);
  assert.equal(closed.data.error.code, 'task_closed');

  const { taskId } = await startProject(s, company, student);
  assert.equal((await student2.post(`/api/tasks/${taskId}/applications`, { proposal, deliveryDays: 5 })).status, 409);

  const t2 = await company.post('/api/tasks', taskBody());
  await s.sql("update tasks set deadline_at = now() - interval '1 hour' where id = $1", [t2.data.id]);
  assert.equal((await student.post(`/api/tasks/${t2.data.id}/applications`, { proposal, deliveryDays: 5 })).status, 409);
});

test('application validation errors are returned per field', async () => {
  const t = await company.post('/api/tasks', taskBody({ durationDays: 5 }));
  const r = await student.post(`/api/tasks/${t.data.id}/applications`, { proposal: 'قصير', deliveryDays: 40, portfolioUrl: 'github.com/x' });
  assert.equal(r.status, 400);
  assert.ok(r.data.error.fields.proposal);
  assert.ok(r.data.error.fields.portfolioUrl);
});

test('task lifecycle: draft → published; only drafts can be published or deleted; assigned tasks cannot be cancelled by the company', async () => {
  const d = await company.post('/api/tasks', taskBody({ publish: false }));
  assert.equal((await company.post(`/api/tasks/${d.data.id}/publish`)).status, 200);
  assert.equal((await company.post(`/api/tasks/${d.data.id}/publish`)).status, 409);
  assert.equal((await company.del(`/api/tasks/${d.data.id}`)).status, 409);
  const { taskId } = await startProject(s, company, student);
  const c = await company.post(`/api/tasks/${taskId}/cancel`, { reason: 'محاولة إلغاء بعد الإسناد' });
  assert.equal(c.status, 409);
  const bad = await company.post('/api/tasks', taskBody({ deadline: new Date().toISOString().slice(0, 10), durationDays: 10 }));
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error.fields.deadline);
});

test('offer lifecycle: decline, withdraw and expiry are final; only pending offers can be accepted', async () => {
  const t = await company.post('/api/tasks', taskBody());
  const a1 = await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  const a2 = await student2.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  const o1 = await company.post(`/api/applications/${a1.data.id}/offer`, {});
  assert.equal((await company.post(`/api/applications/${a1.data.id}/offer`, {})).status, 409, 'one offer per application');
  assert.equal((await student.post(`/api/offers/${o1.data.id}/decline`)).status, 200);
  assert.equal((await student.post(`/api/offers/${o1.data.id}/accept`)).status, 409);

  const o2 = await company.post(`/api/applications/${a2.data.id}/offer`, {});
  await s.sql("update offers set expires_at = now() - interval '1 minute' where id = $1", [o2.data.id]);
  const exp = await student2.post(`/api/offers/${o2.data.id}/accept`);
  assert.equal(exp.status, 409);
  assert.equal(exp.data.error.code, 'offer_expired');
  const [task] = await s.sql('select status from tasks where id = $1', [t.data.id]);
  assert.equal(task.status, 'published', 'task stays open after a declined/expired offer');
});

test('project transitions: valid path and every invalid jump is rejected server-side', async () => {
  const { projectId: p, taskId } = await startProject(s, company, student);
  const detail = await student.get(`/api/projects/${p}`);
  assert.equal(detail.data.status, 'in_progress');
  assert.equal(detail.data.milestones.length, 2);

  // in_progress: company cannot review yet; student cannot approve
  assert.equal((await company.post(`/api/projects/${p}/request-revision`, { feedback: 'ملاحظات قبل أي تسليم' })).status, 409);
  assert.equal((await company.post(`/api/projects/${p}/approve`, { rating: 5, comment: 'اعتماد قبل التسليم!!' })).status, 409);
  assert.equal((await student.post(`/api/projects/${p}/approve`, { rating: 5, comment: 'أعتمد عملي بنفسي' })).status, 403);

  // deliverable needs a link or file
  assert.equal((await student.post(`/api/projects/${p}/deliverables`, { note: 'تسليم بلا روابط', links: [] })).status, 400);
  assert.equal((await student.post(`/api/projects/${p}/deliverables`, { note: 'الجولة الأولى كاملة', links: ['https://example.com/r1'] })).status, 201);
  assert.equal((await student.post(`/api/projects/${p}/deliverables`, { note: 'تسليم ثانٍ مكرر', links: ['https://example.com/r2'] })).status, 409, 'cannot submit while awaiting review');

  // revision needs written feedback
  assert.equal((await company.post(`/api/projects/${p}/request-revision`, { feedback: 'قصير' })).status, 400);
  assert.equal((await company.post(`/api/projects/${p}/request-revision`, { feedback: 'يرجى تبسيط الألوان وتكبير الخط' })).status, 200);
  assert.equal((await company.post(`/api/projects/${p}/approve`, { rating: 5, comment: 'اعتماد أثناء طلب التعديل' })).status, 409);
  assert.equal((await student.post(`/api/projects/${p}/deliverables`, { note: 'الجولة الثانية بعد التعديل', links: ['https://example.com/r2'] })).status, 201);
  assert.equal((await company.post(`/api/projects/${p}/approve`, { rating: 6, comment: 'تقييم خارج المدى' })).status, 400);
  assert.equal((await company.post(`/api/projects/${p}/approve`, { rating: 5, comment: 'عمل ممتاز والتزام بالمواعيد' })).status, 200);

  // completed is terminal
  assert.equal((await student.post(`/api/projects/${p}/deliverables`, { note: 'تسليم بعد الإغلاق', links: ['https://example.com/x'] })).status, 409);
  assert.equal((await company.post(`/api/projects/${p}/request-revision`, { feedback: 'تعديل بعد الاعتماد النهائي' })).status, 409);

  const [task] = await s.sql('select status from tasks where id = $1', [taskId]);
  assert.equal(task.status, 'completed');
  const audit = await s.sql("select metadata from audit_events where entity_id = $1 and action like 'deliverable.%' order by id", [p]);
  assert.deepEqual(audit.map((a) => a.metadata.to), ['awaiting_review', 'revision_requested', 'awaiting_review']);
});

test('payment status is independent: completion leaves it pending; only provider events (sandbox, admin) move it', async () => {
  const { projectId: p } = await startProject(s, company, student);
  await student.post(`/api/projects/${p}/deliverables`, { note: 'تسليم كامل للمراجعة', links: ['https://example.com/a'] });
  await company.post(`/api/projects/${p}/approve`, { rating: 4, comment: 'عمل جيد ومنظم وواضح' });
  const [pay] = await s.sql('select id, status, is_live from payments where project_id = $1', [p]);
  assert.equal(pay.status, 'awaiting_payment', 'sandbox initial status, untouched by completion');
  assert.equal(pay.is_live, false);
  assert.equal((await company.post(`/api/admin/payments/${pay.id}/sandbox-event`, { type: 'payment.captured' })).status, 403);
  await assert.rejects(s.sql("update payments set is_live = true where id = $1", [pay.id]), /check/i);
});

test('milestones: company manages, both can tick, closed projects are read-only', async () => {
  const { projectId: p } = await startProject(s, company, student);
  assert.equal((await student.post(`/api/projects/${p}/milestones`, { title: 'مرحلة من الطالب' })).status, 403);
  const m = await company.post(`/api/projects/${p}/milestones`, { title: 'مراجعة الألوان', dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) });
  assert.equal(m.status, 201);
  assert.ok(m.data.dueAt);
  assert.equal((await student.patch(`/api/milestones/${m.data.id}`, { done: true })).status, 200);
  assert.equal((await student.patch(`/api/milestones/${m.data.id}`, { title: 'تغيير العنوان' })).status, 403);
  assert.equal((await company.del(`/api/milestones/${m.data.id}`)).status, 200);
  await student.post(`/api/projects/${p}/deliverables`, { note: 'تسليم كامل للمراجعة', links: ['https://example.com/m'] });
  await company.post(`/api/projects/${p}/approve`, { rating: 5, comment: 'عمل ممتاز ومنظّم وواضح' });
  const [first] = (await company.get(`/api/projects/${p}`)).data.milestones;
  assert.equal((await company.post(`/api/projects/${p}/milestones`, { title: 'مرحلة بعد الإغلاق' })).status, 409);
  assert.equal((await student.patch(`/api/milestones/${first.id}`, { done: false })).status, 409);
});

test('reports: participants can raise a dispute; duplicates are blocked', async () => {
  const { projectId: p } = await startProject(s, company, student);
  const r = await student.post('/api/reports', { targetType: 'project', targetId: p, reason: 'dispute', details: 'الشركة غيّرت النطاق بعد البدء' });
  assert.equal(r.status, 201);
  assert.equal((await student.post('/api/reports', { targetType: 'project', targetId: p, reason: 'dispute', details: 'بلاغ مكرر على المشروع نفسه' })).status, 409);
  assert.equal((await student2.post('/api/reports', { targetType: 'project', targetId: p, reason: 'dispute', details: 'لست طرفاً في هذا المشروع' })).status, 404);
});

test('dashboard counts are derived from stored rows', async () => {
  const before = (await company.get('/api/dashboard')).data;
  const t = await company.post('/api/tasks', taskBody());
  await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  const after = (await company.get('/api/dashboard')).data;
  assert.equal(after.publishedTasks, before.publishedTasks + 1);
  assert.equal(after.pendingApplicants, before.pendingApplicants + 1);
  const [{ n }] = await s.sql("select count(*)::int as n from applications a join tasks t on t.id = a.task_id where t.company_id = $1 and t.status = 'published' and a.status = 'submitted'", [company.userId]);
  assert.equal(after.pendingApplicants, n);
});
