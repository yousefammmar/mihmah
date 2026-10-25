// Full company + student journey over HTTP with two independent cookie-jar sessions,
// including a backend restart against the same database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, uniqueEmail, PASSWORD, futureDate } from './helpers.js';

let s;
before(async () => { s = await startStack(); });
after(async () => { await s?.stop(); });

test('company registers → publishes → student applies → offer → accept → messages → submit → revision → resubmit → complete → portfolio', async () => {
  const company = s.client();
  const student = s.client();
  const companyEmail = uniqueEmail('e2e-company');
  const studentEmail = uniqueEmail('e2e-student');

  // Register and verify both accounts through the email outbox.
  assert.equal((await company.post('/api/auth/register', { role: 'company', email: companyEmail, password: PASSWORD, name: 'نور الخطيب', companyName: 'استوديو ورد الجوري' })).status, 201);
  assert.equal((await company.post('/api/auth/verify-email', { token: await s.tokenFor(companyEmail) })).status, 200);
  s.ctx.limiter.reset();
  assert.equal((await student.post('/api/auth/register', { role: 'student', email: studentEmail, password: PASSWORD, name: 'هالة السعدي' })).status, 201);
  assert.equal((await student.post('/api/auth/verify-email', { token: await s.tokenFor(studentEmail) })).status, 200);

  assert.equal((await company.put('/api/me/profile', { companyName: 'استوديو ورد الجوري', contactName: 'نور الخطيب', industry: 'خدمات مهنية', city: 'عمّان', bio: 'استوديو صغير لتنسيق الورود وتصويرها للمناسبات.' })).status, 200);
  assert.equal((await student.put('/api/me/profile', { fullName: 'هالة السعدي', university: 'جامعة اليرموك', major: 'الوسائط المتعددة', bio: 'أحب تصوير المنتجات وتعديل الصور للمشاريع الصغيرة.', portfolioUrl: 'https://github.com/hala-photo', skills: ['Photoshop', 'Canva'] })).status, 200);

  // Draft first, then publish.
  const draft = await company.post('/api/tasks', {
    title: 'تصوير وتنسيق 15 صورة منتجات لمتجر ورد', category: 'design',
    summary: 'نحتاج 15 صورة منتجات احترافية لباقات الورد مع تعديل الألوان وتجهيزها لإنستغرام.',
    scope: 'تصوير 15 باقة ورد على خلفية بيضاء داخل الاستوديو ثم تعديل الإضاءة والألوان وتصدير الصور بمقاسين.',
    deliverables: ['15 صورة JPG بمقاسين', 'ملفات المصدر'], skills: ['Photoshop', 'Canva'], milestones: ['جلسة التصوير', 'التعديل والتسليم'],
    budget: 95, durationDays: 6, deadline: futureDate(12), publish: false,
  });
  assert.equal(draft.data.status, 'draft');
  assert.equal((await student.get(`/api/tasks/${draft.data.id}`)).status, 404, 'draft hidden from students');
  assert.equal((await company.post(`/api/tasks/${draft.data.id}/publish`)).status, 200);
  const taskId = draft.data.id;

  // Student finds it with an Arabic search that ignores the shadda, and applies.
  const found = await student.get('/api/tasks', { headers: {} });
  assert.ok(found.data.items.some((t) => t.id === taskId));
  const search = await student.get(`/api/tasks?q=${encodeURIComponent('عمان')}&category=design`);
  assert.ok(search.data.items.some((t) => t.id === taskId), 'search matches city عمّان without diacritics');
  const app = await student.post(`/api/tasks/${taskId}/applications`, { proposal: 'لديّ تجربة في تصوير المنتجات، وأقترح جلسة تصوير واحدة ثم تسليم الصور المعدّلة خلال أربعة أيام.', deliveryDays: 4, portfolioUrl: 'https://github.com/hala-photo' });
  assert.equal(app.status, 201);

  // Company reviews applicants and sends an offer; student accepts.
  const apps = await company.get(`/api/tasks/${taskId}/applications`);
  assert.equal(apps.data.items.length, 1);
  assert.deepEqual(apps.data.items[0].skills, ['Canva', 'Photoshop']);
  const offer = await company.post(`/api/applications/${app.data.id}/offer`, { message: 'نرحب بك' });
  assert.equal(offer.status, 201);
  const mine = await student.get('/api/me/applications');
  assert.equal(mine.data.items[0].offerStatus, 'pending');
  const accepted = await student.post(`/api/offers/${offer.data.id}/accept`);
  assert.equal(accepted.status, 200);
  const projectId = accepted.data.projectId;

  // Both exchange messages.
  assert.equal((await student.post(`/api/projects/${projectId}/messages`, { body: 'هل يناسبكم السبت لجلسة التصوير؟' })).status, 201);
  assert.equal((await company.post(`/api/projects/${projectId}/messages`, { body: 'نعم يناسبنا.' })).status, 201);
  const msgs = await company.get(`/api/projects/${projectId}/messages`);
  assert.deepEqual(msgs.data.items.map((m) => m.senderRole), ['student', 'company']);

  // Submit with an attachment → revision → resubmit → complete.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
  const up = await student.req('POST', `/api/projects/${projectId}/attachments`, png, { raw: true, headers: { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('باقة-1.png') } });
  assert.equal(up.status, 201);
  assert.equal((await student.post(`/api/projects/${projectId}/deliverables`, { note: 'صوّرت 15 باقة وعدّلت الإضاءة.', links: ['https://drive.example.com/r1'], attachmentIds: [up.data.id] })).status, 201);
  assert.equal((await company.post(`/api/projects/${projectId}/request-revision`, { feedback: 'نرجو تدفئة الألوان قليلاً وقصّ الصور الطولية.' })).status, 200);
  assert.equal((await student.get(`/api/projects/${projectId}`)).data.status, 'revision_requested');
  assert.equal((await student.post(`/api/projects/${projectId}/deliverables`, { note: 'دفّأت الألوان وأضفت النسخ الطولية.', links: ['https://drive.example.com/r2'] })).status, 201);
  assert.equal((await company.post(`/api/projects/${projectId}/approve`, { rating: 5, comment: 'تصوير احترافي وتجاوب سريع مع الملاحظات.' })).status, 200);

  // Portfolio, notifications and dashboards reflect the stored records.
  const portfolio = await student.get('/api/me/profile');
  assert.equal(portfolio.data.projects.length, 1);
  assert.equal(portfolio.data.projects[0].rating, 5);
  assert.deepEqual(portfolio.data.projects[0].links, ['https://drive.example.com/r2']);
  const studentNotes = (await student.get('/api/notifications')).data.items.map((n) => n.type);
  for (const type of ['offer.created', 'message.new', 'deliverable.revision_requested', 'project.completed']) assert.ok(studentNotes.includes(type), type);
  const companyNotes = (await company.get('/api/notifications')).data.items.map((n) => n.type);
  for (const type of ['application.submitted', 'offer.accepted', 'deliverable.submitted']) assert.ok(companyNotes.includes(type), type);
  assert.equal((await student.get('/api/dashboard')).data.completedProjects, 1);
  const pay = (await company.get(`/api/projects/${projectId}`)).data.payment;
  assert.equal(pay.isLive, false);
  assert.equal(pay.status, 'awaiting_payment', 'completion does not mark payment as paid');

  // Restart the backend (new process state, same database): sessions and data persist.
  await s.halt();
  await s.boot();
  const after = await student.get('/api/me/profile');
  assert.equal(after.status, 200, 'session cookie still valid after restart');
  assert.equal(after.data.projects[0].id, projectId);
  const p = await company.get(`/api/projects/${projectId}`);
  assert.equal(p.data.status, 'completed');
  assert.equal(p.data.deliverables.length, 2);
  const link = await company.post(`/api/attachments/${up.data.id}/link`);
  assert.deepEqual((await company.get(link.data.url)).data, png);
});
