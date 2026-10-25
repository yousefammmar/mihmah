// Tasks, saved tasks, applications and offers. Every state change is validated here inside a transaction;
// see docs/STATE-MACHINES.md for the allowed transitions.
import express from 'express';
import { asyncRoute, notFound, forbidden, conflict, badRequest, HttpError } from '../lib/errors.js';
import { validator, isUuid, page, paged } from '../lib/validate.js';
import { requireUser, requireRole, requireVerified } from '../lib/sessions.js';
import { audit, notify } from '../lib/activity.js';
import { upsertSkills } from './profiles.js';
import { isDateStr, daysFromToday, endOfAmmanDay } from '../lib/time.js';
import { expireOffers } from '../context.js';

const CATEGORIES = ['design', 'web', 'data', 'slides'];
const HOUR = 3600_000;

const TASK_COLUMNS = `
  t.id, t.company_id as "companyId", t.title, t.category, t.summary, t.scope, t.deliverables,
  t.milestone_template as milestones, t.budget_amount::float8 as budget, t.currency, t.duration_days as "durationDays",
  t.deadline_at as "deadlineAt", t.status, t.cancel_reason as "cancelReason", t.moderation_status as "moderationStatus",
  t.published_at as "publishedAt", t.created_at as "createdAt",
  cp.company_name as "companyName", cp.city as "companyCity", cp.industry as "companyIndustry", cp.bio as "companyBio",
  (cp.verification_status = 'verified') as "companyVerified", cu.is_demo as "isDemo", (cu.status = 'active') as "companyActive",
  coalesce((select array_agg(s.name order by s.name) from task_skills ts join skills s on s.id = ts.skill_id where ts.task_id = t.id), '{}') as skills`;

function readTask(body) {
  const v = validator(body)
    .str('title', { min: 10, max: 90, label: 'العنوان' })
    .oneOf('category', CATEGORIES, { label: 'الفئة' })
    .str('summary', { min: 30, max: 300, label: 'النبذة' })
    .str('scope', { min: 40, max: 2000, label: 'نطاق العمل' })
    .list('deliverables', { min: 1, max: 8, itemMax: 200, label: 'المخرجات' })
    .list('skills', { min: 1, max: 8, itemMax: 40, label: 'المهارات' })
    .list('milestones', { min: 1, max: 6, itemMax: 120, label: 'المراحل' })
    .int('durationDays', { min: 1, max: 60, label: 'مدة التنفيذ' });
  const budget = Number(body?.budget);
  v.check(Number.isFinite(budget) && budget >= 10 && budget <= 2000 && Math.round(budget * 1000) === budget * 1000, 'budget', 'أدخل ميزانية بين 10 و2000 دينار.');
  const deadline = body?.deadline;
  v.check(isDateStr(deadline), 'deadline', 'اختر موعد التسليم.');
  const d = v.done();
  if (daysFromToday(deadline) < d.durationDays) {
    throw badRequest('الموعد قريب جداً.', { deadline: `يجب أن يتسع موعد التسليم لمدة التنفيذ (${d.durationDays} يوماً على الأقل من اليوم).` });
  }
  return { ...d, budget, deadline };
}

export default function taskRoutes(ctx) {
  const { db, config, limiter } = ctx;
  const r = express.Router();

  async function loadTask(id, client = db, lock = false) {
    if (!isUuid(id)) throw notFound('المهمة غير موجودة.');
    const t = (await client.query(`select * from tasks where id = $1 ${lock ? 'for update' : ''}`, [id])).rows[0];
    if (!t) throw notFound('المهمة غير موجودة.');
    return t;
  }

  const companyActive = async (client, companyId) =>
    (await client.query("select status = 'active' as ok from users where id = $1", [companyId])).rows[0]?.ok === true;

  async function writeSkills(client, taskId, names) {
    const ids = await upsertSkills(client, [...new Map(names.map((s) => [s.toLowerCase(), s])).values()]);
    await client.query('delete from task_skills where task_id = $1', [taskId]);
    await client.query('insert into task_skills (task_id, skill_id) select $1, unnest($2::int[])', [taskId, ids]);
  }

  // ---------- browse (students) ----------
  r.get('/tasks', requireUser, asyncRoute(async (req, res) => {
    const q = req.query;
    const pg = page(q, 24);
    const skills = String(q.skills || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 10);
    const sorts = { newest: 't.published_at desc', budget_desc: 't.budget_amount desc', budget_asc: 't.budget_amount asc', deadline: 't.deadline_at asc' };
    const params = [
      req.user.id,
      String(q.q || '').slice(0, 100),
      CATEGORIES.includes(q.category) ? q.category : null,
      skills.length ? skills : null,
      Number.isFinite(Number(q.budgetMin)) && q.budgetMin !== '' && q.budgetMin != null ? Number(q.budgetMin) : null,
      Number.isFinite(Number(q.budgetMax)) && q.budgetMax !== '' && q.budgetMax != null ? Number(q.budgetMax) : null,
      Number.parseInt(q.durationMin, 10) || null,
      Number.parseInt(q.durationMax, 10) || null,
      q.saved === '1',
      pg.limit, pg.offset,
    ];
    const { rows } = await db.query(
      `select ${TASK_COLUMNS},
              exists (select 1 from saved_tasks st where st.task_id = t.id and st.student_id = $1) as saved,
              (select a.status from applications a where a.task_id = t.id and a.student_id = $1) as "myApplicationStatus",
              count(*) over()::int as total
         from tasks t join company_profiles cp on cp.user_id = t.company_id join users cu on cu.id = t.company_id
        where t.status = 'published' and t.moderation_status = 'visible' and cu.status = 'active' and t.deadline_at > now()
          and ($2 = '' or strpos(ar_norm(t.title || ' ' || t.summary || ' ' || cp.company_name || ' ' || coalesce(cp.city, '') || ' ' ||
               coalesce((select string_agg(s.name, ' ') from task_skills ts join skills s on s.id = ts.skill_id where ts.task_id = t.id), '')), ar_norm($2)) > 0)
          and ($3::text is null or t.category = $3)
          and ($4::text[] is null or exists (select 1 from task_skills ts join skills s on s.id = ts.skill_id where ts.task_id = t.id and lower(s.name) = any($4)))
          and ($5::numeric is null or t.budget_amount >= $5)
          and ($6::numeric is null or t.budget_amount <= $6)
          and ($7::int is null or t.duration_days >= $7)
          and ($8::int is null or t.duration_days <= $8)
          and (not $9 or exists (select 1 from saved_tasks st where st.task_id = t.id and st.student_id = $1))
        order by ${sorts[q.sort] || sorts.newest}, t.id
        limit $10 offset $11`,
      params,
    );
    const total = rows[0]?.total ?? 0;
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, total));
  }));

  // ---------- detail ----------
  r.get('/tasks/:id', requireUser, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound('المهمة غير موجودة.');
    const task = await db.one(`select ${TASK_COLUMNS} from tasks t join company_profiles cp on cp.user_id = t.company_id join users cu on cu.id = t.company_id where t.id = $1`, [req.params.id]);
    if (!task) throw notFound('المهمة غير موجودة.');
    const isOwner = task.companyId === req.user.id;
    const myApp = req.user.role === 'student'
      ? await db.one(
        `select a.id, a.status, a.proposal, a.portfolio_url as "portfolioUrl", a.delivery_days as "deliveryDays", a.created_at as "createdAt",
                o.id as "offerId", o.status as "offerStatus", o.expires_at as "offerExpiresAt", o.message as "offerMessage",
                p.id as "projectId"
           from applications a left join offers o on o.application_id = a.id left join projects p on p.offer_id = o.id
          where a.task_id = $1 and a.student_id = $2`, [task.id, req.user.id])
      : null;
    // A suspended company's tasks stop being public, exactly like discovery hides them.
    const isPublic = task.status === 'published' && task.moderationStatus === 'visible' && task.companyActive;
    if (!isOwner && req.user.role !== 'admin' && !isPublic && !myApp) throw notFound('المهمة غير موجودة.');
    const counts = await db.one(
      `select count(*)::int as applicants, count(*) filter (where status = 'submitted')::int as submitted from applications where task_id = $1`, [task.id]);
    const saved = req.user.role === 'student' ? !!(await db.one('select 1 from saved_tasks where student_id = $1 and task_id = $2', [req.user.id, task.id])) : false;
    res.json({ ...task, applicantCount: counts.applicants, submittedCount: counts.submitted, myApplication: myApp, saved, isOwner, canEdit: isOwner && (task.status === 'draft' || (task.status === 'published' && counts.applicants === 0)) });
  }));

  // ---------- company task management ----------
  r.get('/company/tasks', requireRole('company'), asyncRoute(async (req, res) => {
    const pg = page(req.query, 50);
    const status = ['draft', 'published', 'assigned', 'completed', 'cancelled'].includes(req.query.status) ? req.query.status : null;
    const { rows } = await db.query(
      `select ${TASK_COLUMNS},
              (select count(*)::int from applications a where a.task_id = t.id) as "applicantCount",
              (select count(*)::int from applications a where a.task_id = t.id and a.status = 'submitted') as "submittedCount",
              (select count(*)::int from offers o where o.task_id = t.id and o.status = 'pending' and o.expires_at > now()) as "pendingOffers",
              (select p.id from projects p where p.task_id = t.id) as "projectId",
              count(*) over()::int as total
         from tasks t join company_profiles cp on cp.user_id = t.company_id join users cu on cu.id = t.company_id
        where t.company_id = $1 and ($2::text is null or t.status = $2)
        order by t.created_at desc limit $3 offset $4`,
      [req.user.id, status, pg.limit, pg.offset],
    );
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  r.post('/tasks', requireRole('company'), limiter.limit('task-create', 30, HOUR, (req) => req.user.id), asyncRoute(async (req, res) => {
    const d = readTask(req.body);
    const publish = req.body?.publish === true;
    if (publish && !req.user.emailVerified) throw new HttpError(403, 'email_unverified', 'أكّد بريدك الإلكتروني قبل نشر المهام. يمكنك حفظها كمسودة الآن.');
    const id = await db.tx(async (client) => {
      const row = (await client.query(
        `insert into tasks (company_id, title, category, summary, scope, deliverables, milestone_template, budget_amount, duration_days, deadline_at, status, published_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${endOfAmmanDay('$10')}, $11, case when $11 = 'published' then now() end) returning id`,
        [req.user.id, d.title, d.category, d.summary, d.scope, d.deliverables, d.milestones, d.budget, d.durationDays, d.deadline, publish ? 'published' : 'draft'],
      )).rows[0];
      await writeSkills(client, row.id, d.skills);
      await audit(client, { actorId: req.user.id, action: publish ? 'task.published' : 'task.draft_created', entityType: 'task', entityId: row.id });
      return row.id;
    });
    res.status(201).json({ id, status: publish ? 'published' : 'draft' });
  }));

  r.patch('/tasks/:id', requireRole('company'), asyncRoute(async (req, res) => {
    const d = readTask(req.body);
    await db.tx(async (client) => {
      const t = await loadTask(req.params.id, client, true);
      if (t.company_id !== req.user.id) throw forbidden();
      const apps = (await client.query('select count(*)::int as n from applications where task_id = $1', [t.id])).rows[0].n;
      if (!(t.status === 'draft' || (t.status === 'published' && apps === 0))) {
        throw conflict('not_editable', 'لا يمكن تعديل المهمة بعد وصول طلبات عليها. ألغِها وانشر مهمة جديدة إذا تغيّر النطاق.');
      }
      await client.query(
        `update tasks set title = $2, category = $3, summary = $4, scope = $5, deliverables = $6, milestone_template = $7, budget_amount = $8,
                duration_days = $9, deadline_at = ${endOfAmmanDay('$10')}, updated_at = now() where id = $1`,
        [t.id, d.title, d.category, d.summary, d.scope, d.deliverables, d.milestones, d.budget, d.durationDays, d.deadline],
      );
      await writeSkills(client, t.id, d.skills);
      await audit(client, { actorId: req.user.id, action: 'task.updated', entityType: 'task', entityId: t.id });
    });
    res.json({ ok: true });
  }));

  r.post('/tasks/:id/publish', requireRole('company'), requireVerified, asyncRoute(async (req, res) => {
    await db.tx(async (client) => {
      const t = await loadTask(req.params.id, client, true);
      if (t.company_id !== req.user.id) throw forbidden();
      if (t.status !== 'draft') throw conflict('invalid_transition', 'يمكن نشر المسودات فقط.');
      const ok = (await client.query("select deadline_at > now() + make_interval(days => duration_days - 1) as ok from tasks where id = $1", [t.id])).rows[0].ok;
      if (!ok) throw conflict('deadline_passed', 'موعد التسليم لم يعد يتسع لمدة التنفيذ. عدّل الموعد ثم انشر.');
      await client.query("update tasks set status = 'published', published_at = now(), updated_at = now() where id = $1", [t.id]);
      await audit(client, { actorId: req.user.id, action: 'task.published', entityType: 'task', entityId: t.id });
    });
    res.json({ ok: true, status: 'published' });
  }));

  r.delete('/tasks/:id', requireRole('company'), asyncRoute(async (req, res) => {
    const t = await loadTask(req.params.id);
    if (t.company_id !== req.user.id) throw forbidden();
    if (t.status !== 'draft') throw conflict('invalid_transition', 'يمكن حذف المسودات فقط. ألغِ المهمة المنشورة بدلاً من ذلك.');
    await db.query("delete from tasks where id = $1 and status = 'draft'", [t.id]);
    res.json({ ok: true });
  }));

  r.post('/tasks/:id/cancel', requireRole('company'), asyncRoute(async (req, res) => {
    const { reason } = validator(req.body).str('reason', { min: 5, max: 300, label: 'سبب الإلغاء' }).done();
    await db.tx(async (client, after) => {
      const t = await loadTask(req.params.id, client, true);
      if (t.company_id !== req.user.id) throw forbidden();
      if (!['draft', 'published'].includes(t.status)) throw conflict('invalid_transition', 'لا يمكن إلغاء مهمة بعد إسنادها. تواصل مع الإدارة في حال وجود نزاع.');
      await client.query("update tasks set status = 'cancelled', cancel_reason = $2, cancelled_at = now(), updated_at = now() where id = $1", [t.id, reason]);
      const { rows: offers } = await client.query("update offers set status = 'withdrawn', responded_at = now() where task_id = $1 and status = 'pending' returning student_id", [t.id]);
      const { rows: apps } = await client.query("update applications set status = 'rejected', updated_at = now() where task_id = $1 and status = 'submitted' returning student_id", [t.id]);
      for (const { student_id: sid } of [...offers, ...apps]) {
        await notify(ctx, client, after, { userId: sid, type: 'task.cancelled', title: `أُلغيت مهمة «${t.title}» من قبل الشركة`, link: '/applications', emailGroup: 'applications' });
      }
      await audit(client, { actorId: req.user.id, action: 'task.cancelled', entityType: 'task', entityId: t.id, metadata: { affected: offers.length + apps.length } });
    });
    res.json({ ok: true, status: 'cancelled' });
  }));

  // ---------- saved tasks ----------
  r.put('/tasks/:id/save', requireRole('student'), asyncRoute(async (req, res) => {
    const t = await loadTask(req.params.id);
    if (t.status !== 'published') throw conflict('not_available', 'لا يمكن حفظ مهمة غير منشورة.');
    await db.query('insert into saved_tasks (student_id, task_id) values ($1, $2) on conflict do nothing', [req.user.id, t.id]);
    res.json({ saved: true });
  }));

  r.delete('/tasks/:id/save', requireRole('student'), asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    await db.query('delete from saved_tasks where student_id = $1 and task_id = $2', [req.user.id, req.params.id]);
    res.json({ saved: false });
  }));

  // ---------- applications ----------
  r.post('/tasks/:id/applications', requireRole('student'), requireVerified,
    limiter.limit('apply', 20, HOUR, (req) => req.user.id),
    asyncRoute(async (req, res) => {
      const d = validator(req.body)
        .str('proposal', { min: 50, max: 2000, label: 'العرض' })
        .url('portfolioUrl', { label: 'رابط الأعمال' })
        .int('deliveryDays', { min: 1, max: 60, label: 'مدة التسليم' })
        .done();
      const app = await db.tx(async (client, after) => {
        const t = await loadTask(req.params.id, client, true);
        if (t.status !== 'published' || t.moderation_status !== 'visible' || !(await companyActive(client, t.company_id))) throw conflict('task_closed', 'هذه المهمة لم تعد تستقبل طلبات.');
        if (new Date(t.deadline_at) <= new Date()) throw conflict('task_closed', 'انتهى موعد هذه المهمة.');
        if (d.deliveryDays > t.duration_days) throw badRequest('المدة أطول من مدة المهمة.', { deliveryDays: `بحد أقصى ${t.duration_days} يوماً حسب مدة المهمة.` });
        const dup = (await client.query('select 1 from applications where task_id = $1 and student_id = $2', [t.id, req.user.id])).rows[0];
        if (dup) throw conflict('duplicate_application', 'لقد تقدّمت لهذه المهمة مسبقاً. لا يمكن إرسال أكثر من طلب للمهمة نفسها.');
        const row = (await client.query(
          'insert into applications (task_id, student_id, proposal, portfolio_url, delivery_days) values ($1, $2, $3, $4, $5) returning id, status, created_at as "createdAt"',
          [t.id, req.user.id, d.proposal, d.portfolioUrl, d.deliveryDays],
        )).rows[0];
        const name = (await client.query('select full_name from student_profiles where user_id = $1', [req.user.id])).rows[0]?.full_name;
        await notify(ctx, client, after, { userId: t.company_id, type: 'application.submitted', title: `تقدّم ${name} لمهمة «${t.title}»`, link: `/company/tasks/${t.id}`, emailGroup: 'applications' });
        await audit(client, { actorId: req.user.id, action: 'application.submitted', entityType: 'application', entityId: row.id, metadata: { taskId: t.id } });
        return row;
      });
      res.status(201).json(app);
    }));

  r.get('/me/applications', requireRole('student'), asyncRoute(async (req, res) => {
    await expireOffers(db);
    const pg = page(req.query, 50);
    const { rows } = await db.query(
      `select a.id, a.status, a.delivery_days as "deliveryDays", a.created_at as "createdAt",
              t.id as "taskId", t.title as "taskTitle", t.status as "taskStatus", t.budget_amount::float8 as budget, cp.company_name as "companyName",
              o.id as "offerId", o.status as "offerStatus", o.message as "offerMessage", o.expires_at as "offerExpiresAt", p.id as "projectId",
              count(*) over()::int as total
         from applications a join tasks t on t.id = a.task_id join company_profiles cp on cp.user_id = t.company_id
         left join offers o on o.application_id = a.id left join projects p on p.offer_id = o.id
        where a.student_id = $1 order by a.created_at desc limit $2 offset $3`,
      [req.user.id, pg.limit, pg.offset],
    );
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  r.post('/applications/:id/withdraw', requireRole('student'), asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    await db.tx(async (client, after) => {
      const a = (await client.query('select a.*, t.company_id, t.title from applications a join tasks t on t.id = a.task_id where a.id = $1 for update of a', [req.params.id])).rows[0];
      if (!a || a.student_id !== req.user.id) throw notFound('الطلب غير موجود.');
      if (a.status !== 'submitted') throw conflict('invalid_transition', 'يمكن سحب الطلبات قيد المراجعة فقط.');
      await client.query("update applications set status = 'withdrawn', updated_at = now() where id = $1", [a.id]);
      await notify(ctx, client, after, { userId: a.company_id, type: 'application.withdrawn', title: `سحب أحد المتقدّمين طلبه لمهمة «${a.title}»`, link: `/company/tasks/${a.task_id}` });
      await audit(client, { actorId: req.user.id, action: 'application.withdrawn', entityType: 'application', entityId: a.id });
    });
    res.json({ ok: true, status: 'withdrawn' });
  }));

  r.get('/tasks/:id/applications', requireRole('company'), asyncRoute(async (req, res) => {
    await expireOffers(db);
    const t = await loadTask(req.params.id);
    if (t.company_id !== req.user.id) throw forbidden('هذه المهمة ليست ضمن مهام شركتك.');
    const { rows } = await db.query(
      `select a.id, a.status, a.proposal, a.portfolio_url as "portfolioUrl", a.delivery_days as "deliveryDays", a.created_at as "createdAt",
              u.id as "studentId", sp.full_name as "fullName", sp.university, sp.major, u.is_demo as "isDemo",
              (u.email_verified_at is not null) as "emailVerified",
              coalesce((select array_agg(s.name order by s.name) from student_skills ss join skills s on s.id = ss.skill_id where ss.student_id = u.id), '{}') as skills,
              (select count(*)::int from projects p where p.student_id = u.id and p.status = 'completed') as "completedProjects",
              o.id as "offerId", o.status as "offerStatus", o.expires_at as "offerExpiresAt"
         from applications a join users u on u.id = a.student_id join student_profiles sp on sp.user_id = u.id
         left join offers o on o.application_id = a.id
        where a.task_id = $1 order by a.created_at`,
      [t.id],
    );
    res.json({ items: rows });
  }));

  r.post('/applications/:id/reject', requireRole('company'), asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    await db.tx(async (client, after) => {
      const a = (await client.query('select a.*, t.company_id, t.title from applications a join tasks t on t.id = a.task_id where a.id = $1 for update of a', [req.params.id])).rows[0];
      if (!a || a.company_id !== req.user.id) throw notFound('الطلب غير موجود.');
      if (a.status !== 'submitted') throw conflict('invalid_transition', 'يمكن رفض الطلبات قيد المراجعة فقط.');
      await client.query("update applications set status = 'rejected', updated_at = now() where id = $1", [a.id]);
      await notify(ctx, client, after, { userId: a.student_id, type: 'application.rejected', title: `لم يتم اختيارك لمهمة «${a.title}»`, link: '/applications', emailGroup: 'applications' });
      await audit(client, { actorId: req.user.id, action: 'application.rejected', entityType: 'application', entityId: a.id });
    });
    res.json({ ok: true, status: 'rejected' });
  }));

  // ---------- offers ----------
  r.post('/applications/:id/offer', requireRole('company'), requireVerified, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const d = validator(req.body).str('message', { max: 1000, required: false, label: 'رسالة العرض' }).done();
    const offer = await db.tx(async (client, after) => {
      const a = (await client.query('select * from applications where id = $1 for update', [req.params.id])).rows[0];
      if (!a) throw notFound('الطلب غير موجود.');
      const t = await loadTask(a.task_id, client, true);
      if (t.company_id !== req.user.id) throw notFound('الطلب غير موجود.');
      if (t.status !== 'published') throw conflict('task_closed', 'لا يمكن إرسال عرض: المهمة ليست منشورة.');
      if (a.status !== 'submitted') throw conflict('invalid_transition', 'يمكن إرسال عرض للطلبات قيد المراجعة فقط.');
      const row = (await client.query(
        `insert into offers (task_id, application_id, company_id, student_id, message, expires_at)
         values ($1, $2, $3, $4, $5, now() + make_interval(hours => $6)) returning id, status, expires_at as "expiresAt"`,
        [t.id, a.id, req.user.id, a.student_id, d.message, config.offerTtlHours],
      )).rows[0];
      await client.query("update applications set status = 'offered', updated_at = now() where id = $1", [a.id]);
      await notify(ctx, client, after, { userId: a.student_id, type: 'offer.created', title: `وصلك عرض لتنفيذ مهمة «${t.title}». راجعه قبل انتهاء صلاحيته.`, link: '/applications', emailGroup: 'offers' });
      await audit(client, { actorId: req.user.id, action: 'offer.created', entityType: 'offer', entityId: row.id, metadata: { taskId: t.id, applicationId: a.id } });
      return row;
    });
    res.status(201).json(offer);
  }));

  // Accepting is the only way a task becomes assigned. The task row is locked first so concurrent
  // acceptances for the same task are serialised; the partial unique index offers_one_accepted_per_task
  // and projects.task_id uniqueness back this up at the database level.
  r.post('/offers/:id/accept', requireRole('student'), requireVerified, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const pre = await db.one('select task_id, student_id from offers where id = $1', [req.params.id]);
    if (!pre || pre.student_id !== req.user.id) throw notFound('العرض غير موجود.');
    try {
      const project = await db.tx(async (client, after) => {
        const t = await loadTask(pre.task_id, client, true);
        const o = (await client.query('select * from offers where id = $1 for update', [req.params.id])).rows[0];
        // Expired offers are marked by the periodic sweep; here we only refuse them.
        if (o.status === 'pending' && new Date(o.expires_at) <= new Date()) throw conflict('offer_expired', 'انتهت صلاحية هذا العرض.');
        if (o.status !== 'pending') throw conflict('invalid_transition', 'هذا العرض لم يعد متاحاً.');
        if (t.status !== 'published') throw conflict('task_taken', 'تم إسناد هذه المهمة لطالب آخر أو لم تعد متاحة.');
        if (!(await companyActive(client, t.company_id))) throw conflict('task_closed', 'هذه المهمة لم تعد متاحة: حساب الشركة موقوف.');

        await client.query("update offers set status = 'accepted', responded_at = now() where id = $1", [o.id]);
        await client.query("update tasks set status = 'assigned', assigned_at = now(), updated_at = now() where id = $1", [t.id]);
        const { rows: others } = await client.query("update offers set status = 'withdrawn', responded_at = now() where task_id = $1 and status = 'pending' returning student_id", [t.id]);
        const { rows: rejected } = await client.query("update applications set status = 'rejected', updated_at = now() where task_id = $1 and status = 'submitted' returning student_id", [t.id]);

        const p = (await client.query(
          'insert into projects (task_id, offer_id, company_id, student_id) values ($1, $2, $3, $4) returning id',
          [t.id, o.id, t.company_id, o.student_id],
        )).rows[0];
        await client.query('insert into conversations (project_id) values ($1)', [p.id]);
        await client.query(
          'insert into milestones (project_id, title, position) select $1, title, ord from unnest($2::text[]) with ordinality as m(title, ord)',
          [p.id, t.milestone_template],
        );
        const pay = (await client.query(
          `insert into payments (task_id, project_id, company_id, student_id, amount, platform_fee, provider, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, status`,
          [t.id, p.id, t.company_id, o.student_id, t.budget_amount, ctx.payments.feeFor(t.budget_amount), ctx.payments.provider, ctx.payments.initialStatus],
        )).rows[0];
        await client.query("insert into payment_events (payment_id, type, to_status, source) values ($1, 'payment.record_created', $2, 'system')", [pay.id, pay.status]);

        const name = (await client.query('select full_name from student_profiles where user_id = $1', [o.student_id])).rows[0]?.full_name;
        await notify(ctx, client, after, { userId: t.company_id, type: 'offer.accepted', title: `قبل ${name} عرض مهمة «${t.title}» وبدأ المشروع`, link: `/projects/${p.id}`, emailGroup: 'offers' });
        for (const { student_id: sid } of others) {
          await notify(ctx, client, after, { userId: sid, type: 'offer.withdrawn', title: `أُسندت مهمة «${t.title}» لطالب آخر وسُحب عرضك تلقائياً`, link: '/applications', emailGroup: 'offers' });
        }
        for (const { student_id: sid } of rejected) {
          await notify(ctx, client, after, { userId: sid, type: 'application.rejected', title: `لم يتم اختيارك لمهمة «${t.title}». يمكنك التقدّم لمهام أخرى.`, link: '/applications', emailGroup: 'applications' });
        }
        await audit(client, { actorId: req.user.id, action: 'offer.accepted', entityType: 'offer', entityId: o.id, metadata: { taskId: t.id, projectId: p.id } });
        await audit(client, { actorId: req.user.id, action: 'project.created', entityType: 'project', entityId: p.id, metadata: { taskId: t.id } });
        return p;
      });
      res.json({ ok: true, projectId: project.id });
    } catch (err) {
      if (err.code === '23505') throw conflict('task_taken', 'تم إسناد هذه المهمة لطالب آخر.');
      throw err;
    }
  }));

  r.post('/offers/:id/decline', requireRole('student'), asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    await db.tx(async (client, after) => {
      const o = (await client.query('select o.*, t.title from offers o join tasks t on t.id = o.task_id where o.id = $1 for update of o', [req.params.id])).rows[0];
      if (!o || o.student_id !== req.user.id) throw notFound('العرض غير موجود.');
      if (o.status !== 'pending') throw conflict('invalid_transition', 'هذا العرض لم يعد متاحاً.');
      await client.query("update offers set status = 'declined', responded_at = now() where id = $1", [o.id]);
      await notify(ctx, client, after, { userId: o.company_id, type: 'offer.declined', title: `اعتذر الطالب عن عرض مهمة «${o.title}»`, link: `/company/tasks/${o.task_id}`, emailGroup: 'offers' });
      await audit(client, { actorId: req.user.id, action: 'offer.declined', entityType: 'offer', entityId: o.id });
    });
    res.json({ ok: true, status: 'declined' });
  }));

  r.post('/offers/:id/withdraw', requireRole('company'), asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    await db.tx(async (client, after) => {
      const o = (await client.query('select o.*, t.title from offers o join tasks t on t.id = o.task_id where o.id = $1 for update of o', [req.params.id])).rows[0];
      if (!o || o.company_id !== req.user.id) throw notFound('العرض غير موجود.');
      if (o.status !== 'pending') throw conflict('invalid_transition', 'يمكن سحب العروض المعلّقة فقط.');
      await client.query("update offers set status = 'withdrawn', responded_at = now() where id = $1", [o.id]);
      await notify(ctx, client, after, { userId: o.student_id, type: 'offer.withdrawn', title: `سحبت الشركة عرض مهمة «${o.title}»`, link: '/applications', emailGroup: 'offers' });
      await audit(client, { actorId: req.user.id, action: 'offer.withdrawn', entityType: 'offer', entityId: o.id });
    });
    res.json({ ok: true, status: 'withdrawn' });
  }));

  return r;
}

