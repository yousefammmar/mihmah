// Admin area. Every action requires a written reason and is recorded in moderation_actions + audit_events.
import express from 'express';
import { asyncRoute, notFound, conflict, forbidden } from '../lib/errors.js';
import { validator, isUuid, page, paged } from '../lib/validate.js';
import { requireRole } from '../lib/sessions.js';
import { audit, notify } from '../lib/activity.js';
import { SANDBOX_EVENTS } from '../lib/payments.js';

export default function adminRoutes(ctx) {
  const { db, sessions, payments } = ctx;
  const r = express.Router();
  r.use(requireRole('admin'));

  const reasonOf = (body, label = 'السبب') => validator(body).str('reason', { min: 5, max: 1000, label }).done().reason;

  async function recordAction(client, req, action, targetType, targetId, reason, reportId = null) {
    await client.query(
      'insert into moderation_actions (admin_id, action, target_type, target_id, reason, report_id) values ($1, $2, $3, $4, $5, $6)',
      [req.user.id, action, targetType, targetId, reason, reportId]);
    await audit(client, { actorId: req.user.id, action: `admin.${action}`, entityType: targetType, entityId: targetId, metadata: { reportId } });
  }

  r.get('/overview', asyncRoute(async (req, res) => {
    res.json(await db.one(
      `select
         (select count(*)::int from users where role = 'student') as students,
         (select count(*)::int from users where role = 'company') as companies,
         (select count(*)::int from users where status = 'suspended') as suspended,
         (select count(*)::int from company_profiles where verification_status = 'pending') as "pendingVerifications",
         (select count(*)::int from reports where status = 'open') as "openReports",
         (select count(*)::int from reports where status = 'open' and reason = 'dispute') as "openDisputes",
         (select count(*)::int from tasks where status = 'published' and moderation_status = 'visible') as "publishedTasks",
         (select count(*)::int from tasks where moderation_status = 'hidden') as "hiddenTasks",
         (select count(*)::int from projects where status in ('in_progress', 'awaiting_review', 'revision_requested')) as "activeProjects",
         (select count(*)::int from payments where status = 'pending_integration') as "paymentsPendingIntegration"`));
  }));

  // ---------- companies ----------
  r.get('/companies', asyncRoute(async (req, res) => {
    const pg = page(req.query);
    const status = ['unverified', 'pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const { rows } = await db.query(
      `select u.id, u.email, u.status, u.created_at as "createdAt", (u.email_verified_at is not null) as "emailVerified", u.is_demo as "isDemo",
              cp.company_name as "companyName", cp.contact_name as "contactName", cp.industry, cp.city, cp.bio,
              cp.verification_status as "verificationStatus", cp.verification_note as "verificationNote",
              (select count(*)::int from tasks t where t.company_id = u.id) as "taskCount", count(*) over()::int as total
         from users u join company_profiles cp on cp.user_id = u.id
        where ($1::text is null or cp.verification_status = $1)
        order by (cp.verification_status = 'pending') desc, u.created_at desc limit $2 offset $3`,
      [status, pg.limit, pg.offset]);
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  r.post('/companies/:id/verification', asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const d = validator(req.body).oneOf('decision', ['verified', 'rejected'], { label: 'القرار' }).str('note', { min: 10, max: 1000, label: 'ما الذي تم التحقق منه' }).done();
    await db.tx(async (client, after) => {
      const c = (await client.query('select * from company_profiles where user_id = $1 for update', [req.params.id])).rows[0];
      if (!c) throw notFound('الشركة غير موجودة.');
      await client.query(
        `update company_profiles set verification_status = $2, verification_note = $3,
                verified_at = case when $2 = 'verified' then now() else null end,
                verified_by = case when $2 = 'verified' then $4::uuid else null end, updated_at = now()
          where user_id = $1`, [c.user_id, d.decision, d.note, req.user.id]);
      await recordAction(client, req, d.decision === 'verified' ? 'verify_company' : 'reject_company', 'user', c.user_id, d.note);
      await notify(ctx, client, after, {
        userId: c.user_id, type: 'company.verification',
        title: d.decision === 'verified' ? 'تم توثيق حساب شركتك' : 'لم يُقبل طلب توثيق شركتك. راجع الملاحظات في الإعدادات.', link: '/settings',
      });
    });
    res.json({ ok: true, verificationStatus: d.decision });
  }));

  // ---------- reports ----------
  r.get('/reports', asyncRoute(async (req, res) => {
    const pg = page(req.query);
    const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : null;
    const { rows } = await db.query(
      `select r.id, r.target_type as "targetType", r.target_id as "targetId", r.reason, r.details, r.status, r.resolution_note as "resolutionNote",
              r.created_at as "createdAt", r.resolved_at as "resolvedAt", ru.email as "reporterEmail", ru.role as "reporterRole",
              coalesce(t.title, pt.title, sp.full_name, cp.company_name, au.email) as "targetLabel",
              count(*) over()::int as total
         from reports r join users ru on ru.id = r.reporter_id
         left join tasks t on r.target_type = 'task' and t.id = r.target_id
         left join projects p on r.target_type = 'project' and p.id = r.target_id left join tasks pt on pt.id = p.task_id
         left join users au on r.target_type = 'user' and au.id = r.target_id
         left join student_profiles sp on sp.user_id = au.id left join company_profiles cp on cp.user_id = au.id
        where ($1::text is null or r.status = $1)
        order by r.created_at desc limit $2 offset $3`,
      [status, pg.limit, pg.offset]);
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  r.post('/reports/:id/resolve', asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const d = validator(req.body).oneOf('status', ['resolved', 'dismissed'], { label: 'القرار' }).str('note', { min: 5, max: 1000, label: 'ملاحظة القرار' }).done();
    await db.tx(async (client, after) => {
      const rep = (await client.query('select * from reports where id = $1 for update', [req.params.id])).rows[0];
      if (!rep) throw notFound('البلاغ غير موجود.');
      if (rep.status !== 'open') throw conflict('invalid_transition', 'تمت معالجة هذا البلاغ مسبقاً.');
      await client.query('update reports set status = $2, resolution_note = $3, resolved_by = $4, resolved_at = now() where id = $1', [rep.id, d.status, d.note, req.user.id]);
      await recordAction(client, req, d.status === 'resolved' ? 'resolve_report' : 'dismiss_report', rep.target_type, rep.target_id, d.note, rep.id);
      await notify(ctx, client, after, { userId: rep.reporter_id, type: 'report.closed', title: 'تمت مراجعة بلاغك من قبل الإدارة', link: '/notifications' });
    });
    res.json({ ok: true });
  }));

  // ---------- task moderation ----------
  r.get('/tasks', asyncRoute(async (req, res) => {
    const pg = page(req.query);
    const mod = ['visible', 'hidden'].includes(req.query.moderation) ? req.query.moderation : null;
    const q = String(req.query.q || '').slice(0, 100);
    const { rows } = await db.query(
      `select t.id, t.title, t.status, t.moderation_status as "moderationStatus", t.moderation_reason as "moderationReason",
              t.budget_amount::float8 as budget, t.created_at as "createdAt", cp.company_name as "companyName", t.company_id as "companyId",
              (select count(*)::int from reports r where r.target_type = 'task' and r.target_id = t.id and r.status = 'open') as "openReports",
              count(*) over()::int as total
         from tasks t join company_profiles cp on cp.user_id = t.company_id
        where t.status <> 'draft' and ($1::text is null or t.moderation_status = $1) and ($2 = '' or strpos(ar_norm(t.title || ' ' || cp.company_name), ar_norm($2)) > 0)
        order by "openReports" desc, t.created_at desc limit $3 offset $4`,
      [mod, q, pg.limit, pg.offset]);
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  r.post('/tasks/:id/moderation', asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const d = validator(req.body).oneOf('action', ['hide', 'unhide'], { label: 'الإجراء' }).str('reason', { min: 5, max: 1000, label: 'السبب' }).done();
    await db.tx(async (client, after) => {
      const t = (await client.query('select * from tasks where id = $1 for update', [req.params.id])).rows[0];
      if (!t) throw notFound('المهمة غير موجودة.');
      await client.query('update tasks set moderation_status = $2, moderation_reason = $3, updated_at = now() where id = $1',
        [t.id, d.action === 'hide' ? 'hidden' : 'visible', d.action === 'hide' ? d.reason : null]);
      await recordAction(client, req, d.action === 'hide' ? 'hide_task' : 'unhide_task', 'task', t.id, d.reason);
      await notify(ctx, client, after, {
        userId: t.company_id, type: 'task.moderation',
        title: d.action === 'hide' ? `أخفت الإدارة مهمة «${t.title}»: ${d.reason}` : `أعادت الإدارة إظهار مهمة «${t.title}»`, link: '/company/tasks',
      });
    });
    res.json({ ok: true });
  }));

  // ---------- users ----------
  r.get('/users', asyncRoute(async (req, res) => {
    const pg = page(req.query);
    const role = ['student', 'company', 'admin'].includes(req.query.role) ? req.query.role : null;
    const status = ['active', 'suspended'].includes(req.query.status) ? req.query.status : null;
    const q = String(req.query.q || '').slice(0, 100);
    const { rows } = await db.query(
      `select u.id, u.email, u.role, u.status, u.suspended_reason as "suspendedReason", u.created_at as "createdAt", u.is_demo as "isDemo",
              (u.email_verified_at is not null) as "emailVerified", coalesce(sp.full_name, cp.company_name, '—') as name,
              count(*) over()::int as total
         from users u left join student_profiles sp on sp.user_id = u.id left join company_profiles cp on cp.user_id = u.id
        where ($1::text is null or u.role = $1) and ($2::text is null or u.status = $2)
          and ($3 = '' or strpos(lower(u.email), lower($3)) > 0 or strpos(ar_norm(coalesce(sp.full_name, cp.company_name, '')), ar_norm($3)) > 0)
        order by u.created_at desc limit $4 offset $5`,
      [role, status, q, pg.limit, pg.offset]);
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  r.post('/users/:id/suspend', asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const reason = reasonOf(req.body, 'سبب الإيقاف');
    await db.tx(async (client) => {
      const u = (await client.query('select id, role, status from users where id = $1 for update', [req.params.id])).rows[0];
      if (!u) throw notFound('المستخدم غير موجود.');
      if (u.role === 'admin') throw forbidden('لا يمكن إيقاف حساب مسؤول من هنا.');
      if (u.status === 'suspended') throw conflict('invalid_transition', 'الحساب موقوف بالفعل.');
      await client.query("update users set status = 'suspended', suspended_reason = $2, updated_at = now() where id = $1", [u.id, reason]);
      await sessions.revokeAll(u.id, client);
      await recordAction(client, req, 'suspend_user', 'user', u.id, reason);
    });
    res.json({ ok: true, status: 'suspended' });
  }));

  r.post('/users/:id/reinstate', asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const reason = reasonOf(req.body, 'سبب إعادة التفعيل');
    await db.tx(async (client) => {
      const u = (await client.query('select id, status from users where id = $1 for update', [req.params.id])).rows[0];
      if (!u) throw notFound('المستخدم غير موجود.');
      if (u.status !== 'suspended') throw conflict('invalid_transition', 'الحساب غير موقوف.');
      await client.query("update users set status = 'active', suspended_reason = null, updated_at = now() where id = $1", [u.id]);
      await recordAction(client, req, 'reinstate_user', 'user', u.id, reason);
    });
    res.json({ ok: true, status: 'active' });
  }));

  // ---------- projects & disputes ----------
  r.get('/projects', asyncRoute(async (req, res) => {
    const pg = page(req.query);
    const disputed = req.query.disputed === '1';
    const { rows } = await db.query(
      `select p.id, p.status, p.started_at as "startedAt", t.title, sp.full_name as "studentName", cp.company_name as "companyName",
              (select count(*)::int from reports r where r.target_type = 'project' and r.target_id = p.id and r.status = 'open') as "openDisputes",
              count(*) over()::int as total
         from projects p join tasks t on t.id = p.task_id
         join student_profiles sp on sp.user_id = p.student_id join company_profiles cp on cp.user_id = p.company_id
        where (not $1 or exists (select 1 from reports r where r.target_type = 'project' and r.target_id = p.id and r.status = 'open'))
        order by "openDisputes" desc, p.started_at desc limit $2 offset $3`,
      [disputed, pg.limit, pg.offset]);
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  // Dispute resolution: closes an active project. Captured funds would need a provider refund, so
  // only payments that never moved money are cancelled here.
  r.post('/projects/:id/cancel', asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const reason = reasonOf(req.body, 'سبب الإلغاء');
    await db.tx(async (client, after) => {
      const p = (await client.query('select p.*, t.title from projects p join tasks t on t.id = p.task_id where p.id = $1 for update of p', [req.params.id])).rows[0];
      if (!p) throw notFound('المشروع غير موجود.');
      if (!['in_progress', 'awaiting_review', 'revision_requested'].includes(p.status)) throw conflict('invalid_transition', 'يمكن إلغاء المشاريع النشطة فقط.');
      await client.query("update projects set status = 'cancelled', cancel_reason = $2, updated_at = now() where id = $1", [p.id, reason]);
      await client.query("update tasks set status = 'cancelled', cancel_reason = $2, cancelled_at = now(), updated_at = now() where id = $1", [p.task_id, `إلغاء إداري: ${reason}`]);
      const pay = (await client.query("update payments set status = 'cancelled', updated_at = now() where project_id = $1 and status in ('pending_integration', 'awaiting_payment', 'authorized') returning id", [p.id])).rows[0];
      if (pay) await client.query("insert into payment_events (payment_id, type, to_status, source) values ($1, 'payment.cancelled', 'cancelled', 'admin')", [pay.id]);
      await recordAction(client, req, 'cancel_project', 'project', p.id, reason);
      for (const uid of [p.student_id, p.company_id]) {
        await notify(ctx, client, after, { userId: uid, type: 'project.cancelled', title: `ألغت الإدارة مشروع «${p.title}»: ${reason}`, link: `/projects/${p.id}`, emailGroup: 'projects' });
      }
    });
    res.json({ ok: true, status: 'cancelled' });
  }));

  // ---------- audit ----------
  r.get('/audit', asyncRoute(async (req, res) => {
    const pg = page(req.query, 100);
    const entityId = isUuid(req.query.entityId) ? req.query.entityId : null;
    const actorId = isUuid(req.query.actorId) ? req.query.actorId : null;
    const { rows } = await db.query(
      `select a.id, a.action, a.entity_type as "entityType", a.entity_id as "entityId", a.metadata, a.created_at as "createdAt",
              u.email as "actorEmail", u.role as "actorRole", count(*) over()::int as total
         from audit_events a left join users u on u.id = a.actor_id
        where ($1::uuid is null or a.entity_id = $1) and ($2::uuid is null or a.actor_id = $2)
        order by a.created_at desc, a.id desc limit $3 offset $4`,
      [entityId, actorId, pg.limit, pg.offset]);
    res.json(paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0));
  }));

  // ---------- payments ----------
  r.get('/payments', asyncRoute(async (req, res) => {
    const pg = page(req.query);
    const { rows } = await db.query(
      `select pay.id, pay.status, pay.provider, pay.amount::float8 as amount, pay.platform_fee::float8 as "platformFee", pay.currency,
              pay.updated_at as "updatedAt", t.title, pay.project_id as "projectId", count(*) over()::int as total
         from payments pay join tasks t on t.id = pay.task_id order by pay.updated_at desc limit $1 offset $2`,
      [pg.limit, pg.offset]);
    res.json({ ...paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0), provider: payments.provider, live: false, sandboxEvents: Object.keys(SANDBOX_EVENTS) });
  }));

  // Sandbox only: simulates a provider webhook. This is the only path that changes a payment status.
  r.post('/payments/:id/sandbox-event', asyncRoute(async (req, res) => {
    payments.assertSandbox();
    if (!isUuid(req.params.id)) throw notFound();
    const d = validator(req.body).oneOf('type', Object.keys(SANDBOX_EVENTS), { label: 'نوع الحدث' }).done();
    const to = SANDBOX_EVENTS[d.type];
    const out = await db.tx(async (client) => {
      const pay = (await client.query('select * from payments where id = $1 for update', [req.params.id])).rows[0];
      if (!pay) throw notFound('سجل الدفع غير موجود.');
      if (pay.provider !== 'sandbox') throw conflict('not_sandbox', 'هذا السجل ليس ضمن بيئة الدفع التجريبية.');
      payments.assertTransition(pay.status, to);
      await client.query('update payments set status = $2, updated_at = now() where id = $1', [pay.id, to]);
      await client.query("insert into payment_events (payment_id, type, from_status, to_status, source, data) values ($1, $2, $3, $4, 'provider_webhook', $5)",
        [pay.id, d.type, pay.status, to, { sandbox: true, triggeredBy: req.user.id }]);
      await audit(client, { actorId: req.user.id, action: 'payment.sandbox_event', entityType: 'payment', entityId: pay.id, metadata: { type: d.type, from: pay.status, to } });
      return { id: pay.id, status: to };
    });
    res.json(out);
  }));

  return r;
}
