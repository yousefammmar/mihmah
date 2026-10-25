// Notifications, live update stream and user reports.
import express from 'express';
import { asyncRoute, notFound, conflict } from '../lib/errors.js';
import { validator, isUuid, page, paged } from '../lib/validate.js';
import { requireUser } from '../lib/sessions.js';
import { audit, notify } from '../lib/activity.js';

export default function inboxRoutes(ctx) {
  const { db, events, limiter } = ctx;
  const r = express.Router();

  r.get('/notifications', requireUser, asyncRoute(async (req, res) => {
    const pg = page(req.query, 50);
    const { rows } = await db.query(
      `select id, type, title, link, read_at as "readAt", created_at as "createdAt", count(*) over()::int as total
         from notifications where user_id = $1 order by created_at desc limit $2 offset $3`,
      [req.user.id, pg.limit, pg.offset]);
    const unread = (await db.one('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [req.user.id])).n;
    res.json({ ...paged(rows.map(({ total: _t, ...x }) => x), pg, rows[0]?.total ?? 0), unread });
  }));

  r.post('/notifications/:id/read', requireUser, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    await db.query('update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  }));

  r.post('/notifications/read-all', requireUser, asyncRoute(async (req, res) => {
    await db.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.id]);
    res.json({ ok: true });
  }));

  r.get('/events', requireUser, (req, res) => events.subscribe(req, res));

  r.post('/reports', requireUser, limiter.limit('report', 10, 86400_000, (req) => req.user.id), asyncRoute(async (req, res) => {
    const d = validator(req.body)
      .oneOf('targetType', ['task', 'user', 'project'], { label: 'نوع البلاغ' })
      .str('targetId', { min: 36, max: 36, label: 'المعرّف' })
      .oneOf('reason', ['spam', 'fraud', 'inappropriate', 'dispute', 'other'], { label: 'السبب' })
      .str('details', { min: 10, max: 2000, label: 'التفاصيل' })
      .done();
    if (!isUuid(d.targetId)) throw notFound();
    // The reporter must be able to see the target; projects only by their participants.
    const visible = {
      task: "select 1 from tasks where id = $1 and (status <> 'draft' or company_id = $2)",
      user: 'select 1 from users where id = $1 and id <> $2',
      project: 'select 1 from projects where id = $1 and (student_id = $2 or company_id = $2)',
    }[d.targetType];
    if (!(await db.one(visible, [d.targetId, req.user.id]))) throw notFound('العنصر المبلّغ عنه غير موجود.');
    const dup = await db.one("select 1 from reports where reporter_id = $1 and target_type = $2 and target_id = $3 and status = 'open'", [req.user.id, d.targetType, d.targetId]);
    if (dup) throw conflict('duplicate_report', 'لديك بلاغ مفتوح على هذا العنصر وهو قيد المراجعة.');
    const row = await db.tx(async (client, after) => {
      const rep = (await client.query(
        'insert into reports (reporter_id, target_type, target_id, reason, details) values ($1, $2, $3, $4, $5) returning id',
        [req.user.id, d.targetType, d.targetId, d.reason, d.details])).rows[0];
      const { rows: admins } = await client.query("select id from users where role = 'admin' and status = 'active'");
      for (const a of admins) await notify(ctx, client, after, { userId: a.id, type: 'report.new', title: 'بلاغ جديد بانتظار المراجعة', link: '/admin/reports' });
      await audit(client, { actorId: req.user.id, action: 'report.created', entityType: d.targetType, entityId: d.targetId, metadata: { reportId: rep.id, reason: d.reason } });
      return rep;
    });
    res.status(201).json({ id: row.id, message: 'وصل بلاغك إلى فريق الإدارة. سنراجعه في أقرب وقت.' });
  }));

  return r;
}
