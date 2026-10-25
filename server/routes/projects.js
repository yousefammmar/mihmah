// Projects (the shared workspace), milestones, messages, private attachments, deliverables and reviews.
// Only the two participants (and admins, audited) can see a project; non-participants get 404.
import express from 'express';
import crypto from 'node:crypto';
import { asyncRoute, notFound, forbidden, conflict, badRequest, HttpError } from '../lib/errors.js';
import { validator, isUuid, isHttpUrl } from '../lib/validate.js';
import { requireUser } from '../lib/sessions.js';
import { audit, notify, signal } from '../lib/activity.js';
import { hmac, safeEqual } from '../lib/security.js';
import { isDateStr, endOfAmmanDay } from '../lib/time.js';

const ACTIVE = ['in_progress', 'awaiting_review', 'revision_requested'];
const HOUR = 3600_000;

// Allowed upload types: extension -> { mime, magic check }. SVG/HTML are never accepted.
const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const FILE_TYPES = {
  png: { mime: 'image/png', ok: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: 'image/jpeg', ok: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', ok: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { mime: 'image/webp', ok: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  gif: { mime: 'image/gif', ok: (b) => b.subarray(0, 4).toString() === 'GIF8' },
  pdf: { mime: 'application/pdf', ok: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  zip: { mime: 'application/zip', ok: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ok: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ok: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ok: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  csv: { mime: 'text/csv', ok: (b) => !b.subarray(0, 4096).includes(0) },
  txt: { mime: 'text/plain', ok: (b) => !b.subarray(0, 4096).includes(0) },
};
export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPES);

function cleanFileName(raw) {
  let name = '';
  try { name = decodeURIComponent(String(raw || '')); } catch { name = ''; }
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, '').replace(/^\.+/, '').trim();
  return name.slice(-120);
}

const contentDisposition = (name) => `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export default function projectRoutes(ctx) {
  const { db, config, storage, limiter } = ctx;
  const r = express.Router();

  async function loadProject(req, id, { client = db, lock = false, allowAdmin = false } = {}) {
    if (!isUuid(id)) throw notFound('المشروع غير موجود.');
    const p = (await client.query(
      `select p.*, t.title, t.budget_amount, t.milestone_template from projects p join tasks t on t.id = p.task_id where p.id = $1 ${lock ? 'for update of p' : ''}`,
      [id],
    )).rows[0];
    if (!p) throw notFound('المشروع غير موجود.');
    const role = p.student_id === req.user.id ? 'student' : p.company_id === req.user.id ? 'company' : (allowAdmin && req.user.role === 'admin' ? 'admin' : null);
    if (!role) throw notFound('المشروع غير موجود.');
    return { p, role };
  }

  const requireActive = (p) => { if (!ACTIVE.includes(p.status)) throw conflict('project_closed', 'المشروع مغلق ولا يقبل هذا الإجراء.'); };

  async function attachmentsFor(column, ids) {
    if (!ids.length) return new Map();
    const { rows } = await db.query(
      `select id, ${column} as owner, original_name as name, mime_type as "mimeType", size_bytes as size, uploader_id as "uploaderId", created_at as "createdAt"
         from attachments where ${column} = any($1::uuid[]) order by created_at`, [ids]);
    const map = new Map();
    for (const a of rows) { const list = map.get(a.owner) || []; list.push(a); map.set(a.owner, list); delete a.owner; }
    return map;
  }

  // Links previously uploaded files to a message or deliverable; all must be the caller's, unlinked, same project.
  async function linkAttachments(client, ids, projectId, userId, column, ownerId) {
    if (!ids.length) return;
    const { rowCount } = await client.query(
      `update attachments set ${column} = $1
        where id = any($2::uuid[]) and project_id = $3 and uploader_id = $4 and message_id is null and deliverable_id is null`,
      [ownerId, ids, projectId, userId],
    );
    if (rowCount !== ids.length) throw badRequest('أحد الملفات المرفقة غير صالح أو مستخدم مسبقاً.');
  }

  async function projectDetail(p, role) {
    const [task, people, milestones, deliverables, payment, reviews] = await Promise.all([
      db.one(
        `select t.id, t.title, t.category, t.summary, t.scope, t.deliverables, t.budget_amount::float8 as budget, t.currency, t.duration_days as "durationDays", t.deadline_at as "deadlineAt",
                coalesce((select array_agg(s.name order by s.name) from task_skills ts join skills s on s.id = ts.skill_id where ts.task_id = t.id), '{}') as skills
           from tasks t where t.id = $1`, [p.task_id]),
      db.one(
        `select json_build_object('id', sp.user_id, 'fullName', sp.full_name, 'university', sp.university, 'major', sp.major) as student,
                json_build_object('id', cp.user_id, 'companyName', cp.company_name, 'city', cp.city, 'verified', cp.verification_status = 'verified') as company
           from student_profiles sp, company_profiles cp where sp.user_id = $1 and cp.user_id = $2`, [p.student_id, p.company_id]),
      db.query('select id, title, position, due_at as "dueAt", done_at as "doneAt" from milestones where project_id = $1 order by position, created_at', [p.id]),
      db.query(
        `select d.id, d.round, d.note, d.links, d.created_at as "createdAt",
                case when r.id is null then null else json_build_object('decision', r.decision, 'feedback', r.feedback, 'createdAt', r.created_at) end as review
           from deliverables d left join deliverable_reviews r on r.deliverable_id = d.id where d.project_id = $1 order by d.round`, [p.id]),
      db.one(
        `select id, status, provider, amount::float8 as amount, platform_fee::float8 as "platformFee", currency, is_live as "isLive", updated_at as "updatedAt"
           from payments where project_id = $1`, [p.id]),
      db.query(
        `select r.rating, r.comment, r.created_at as "createdAt", case when r.reviewer_id = $2 then 'company' else 'student' end as "reviewerRole"
           from reviews r where r.project_id = $1`, [p.id, p.company_id]),
    ]);
    const files = await attachmentsFor('deliverable_id', deliverables.rows.map((d) => d.id));
    const myReview = reviews.rows.find((x) => x.reviewerRole === role);
    return {
      id: p.id, status: p.status, cancelReason: p.cancel_reason, startedAt: p.started_at, completedAt: p.completed_at,
      task, student: people.student, company: people.company,
      milestones: milestones.rows,
      deliverables: deliverables.rows.map((d) => ({ ...d, attachments: files.get(d.id) || [] })),
      payment, reviews: reviews.rows, viewerRole: role,
      actions: {
        submit: role === 'student' && ['in_progress', 'revision_requested'].includes(p.status),
        review: role === 'company' && p.status === 'awaiting_review',
        manageMilestones: role === 'company' && ACTIVE.includes(p.status),
        toggleMilestones: ['student', 'company'].includes(role) && ACTIVE.includes(p.status),
        message: ['student', 'company'].includes(role) && p.status !== 'cancelled',
        reviewCompany: role === 'student' && p.status === 'completed' && !myReview,
        report: ['student', 'company'].includes(role),
      },
    };
  }

  // ---------- list & detail ----------
  r.get('/projects', requireUser, asyncRoute(async (req, res) => {
    const col = req.user.role === 'student' ? 'p.student_id' : req.user.role === 'company' ? 'p.company_id' : null;
    if (!col) throw forbidden();
    const { rows } = await db.query(
      `select p.id, p.status, p.started_at as "startedAt", p.completed_at as "completedAt", t.title, t.budget_amount::float8 as budget,
              sp.full_name as "studentName", cp.company_name as "companyName", pay.status as "paymentStatus",
              (select count(*)::int from milestones m where m.project_id = p.id) as "milestoneCount",
              (select count(*)::int from milestones m where m.project_id = p.id and m.done_at is not null) as "milestonesDone"
         from projects p join tasks t on t.id = p.task_id
         join student_profiles sp on sp.user_id = p.student_id join company_profiles cp on cp.user_id = p.company_id
         left join payments pay on pay.project_id = p.id
        where ${col} = $1 order by p.started_at desc`,
      [req.user.id],
    );
    res.json({ items: rows });
  }));

  r.get('/projects/:id', requireUser, asyncRoute(async (req, res) => {
    const { p, role } = await loadProject(req, req.params.id, { allowAdmin: true });
    if (role === 'admin') await audit(db, { actorId: req.user.id, action: 'admin.project_viewed', entityType: 'project', entityId: p.id });
    res.json(await projectDetail(p, role));
  }));

  // Participant-visible history, derived from audit events (admin-internal actions excluded).
  r.get('/projects/:id/activity', requireUser, asyncRoute(async (req, res) => {
    const { p } = await loadProject(req, req.params.id, { allowAdmin: true });
    const { rows } = await db.query(
      `select a.id, a.action, a.metadata, a.created_at as "createdAt",
              case when a.actor_id = $2 then 'student' when a.actor_id = $3 then 'company' else 'admin' end as "actorRole"
         from audit_events a
        where ((a.entity_type = 'project' and a.entity_id = $1) or (a.entity_type = 'offer' and a.entity_id = $4))
          and (a.action not like 'admin.%' or a.action = 'admin.cancel_project')
          and a.action <> 'attachment.uploaded'
        order by a.created_at desc, a.id desc limit 100`,
      [p.id, p.student_id, p.company_id, p.offer_id]);
    res.json({ items: rows.map(({ metadata, ...x }) => ({ ...x, round: metadata?.round ?? null })) });
  }));

  // ---------- milestones ----------
  r.post('/projects/:id/milestones', requireUser, asyncRoute(async (req, res) => {
    const d = validator(req.body).str('title', { min: 2, max: 120, label: 'عنوان المرحلة' }).done();
    const due = req.body?.dueDate;
    if (due != null && due !== '' && !isDateStr(due)) throw badRequest('تاريخ غير صالح.', { dueDate: 'تاريخ غير صالح.' });
    const row = await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, req.params.id, { client, lock: true });
      if (role !== 'company') throw forbidden('تدير الشركة صاحبة المهمة المراحل.');
      requireActive(p);
      const n = (await client.query('select count(*)::int as n, coalesce(max(position), 0) as maxp from milestones where project_id = $1', [p.id])).rows[0];
      if (n.n >= 12) throw conflict('limit', '12 مرحلة كحد أقصى.');
      const m = (await client.query(
        `insert into milestones (project_id, title, position, due_at) values ($1, $2, $3, case when $4::text is null then null else ${endOfAmmanDay('$4')} end)
         returning id, title, position, due_at as "dueAt", done_at as "doneAt"`,
        [p.id, d.title, n.maxp + 1, due || null])).rows[0];
      await audit(client, { actorId: req.user.id, action: 'milestone.created', entityType: 'project', entityId: p.id });
      signal(ctx, after, [p.student_id, p.company_id], 'project', { id: p.id });
      return m;
    });
    res.status(201).json(row);
  }));

  r.patch('/milestones/:id', requireUser, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const m0 = await db.one('select project_id from milestones where id = $1', [req.params.id]);
    if (!m0) throw notFound('المرحلة غير موجودة.');
    const body = req.body || {};
    await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, m0.project_id, { client, lock: true });
      requireActive(p);
      if ('title' in body || 'dueDate' in body) {
        if (role !== 'company') throw forbidden('تعدّل الشركة عناوين المراحل ومواعيدها.');
        const d = validator(body).str('title', { min: 2, max: 120, label: 'عنوان المرحلة' }).done();
        const due = body.dueDate;
        if (due != null && due !== '' && !isDateStr(due)) throw badRequest('تاريخ غير صالح.', { dueDate: 'تاريخ غير صالح.' });
        await client.query(`update milestones set title = $2, due_at = case when $3::text is null then null else ${endOfAmmanDay('$3')} end where id = $1`, [req.params.id, d.title, due || null]);
      }
      if ('done' in body) {
        await client.query('update milestones set done_at = case when $2 then coalesce(done_at, now()) else null end where id = $1', [req.params.id, body.done === true]);
        await client.query('insert into audit_events (actor_id, action, entity_type, entity_id, metadata) values ($1, $2, $3, $4, $5)',
          [req.user.id, body.done ? 'milestone.done' : 'milestone.reopened', 'project', p.id, { milestoneId: req.params.id }]);
      }
      signal(ctx, after, [p.student_id, p.company_id], 'project', { id: p.id });
    });
    res.json({ ok: true });
  }));

  r.delete('/milestones/:id', requireUser, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const m0 = await db.one('select project_id from milestones where id = $1', [req.params.id]);
    if (!m0) throw notFound('المرحلة غير موجودة.');
    await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, m0.project_id, { client, lock: true });
      if (role !== 'company') throw forbidden('تدير الشركة صاحبة المهمة المراحل.');
      requireActive(p);
      await client.query('delete from milestones where id = $1', [req.params.id]);
      await audit(client, { actorId: req.user.id, action: 'milestone.deleted', entityType: 'project', entityId: p.id });
      signal(ctx, after, [p.student_id, p.company_id], 'project', { id: p.id });
    });
    res.json({ ok: true });
  }));

  // ---------- messages ----------
  r.get('/projects/:id/messages', requireUser, asyncRoute(async (req, res) => {
    const { p, role } = await loadProject(req, req.params.id, { allowAdmin: true });
    if (role === 'admin') await audit(db, { actorId: req.user.id, action: 'admin.messages_viewed', entityType: 'project', entityId: p.id });
    const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : null;
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 100);
    const { rows } = await db.query(
      `select m.id, m.body, m.created_at as "createdAt", m.sender_id as "senderId",
              case when m.sender_id = $2 then 'student' else 'company' end as "senderRole"
         from messages m join conversations c on c.id = m.conversation_id
        where c.project_id = $1 and ($3::timestamptz is null or m.created_at < $3)
        order by m.created_at desc limit $4`,
      [p.id, p.student_id, before, limit + 1],
    );
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).reverse();
    const files = await attachmentsFor('message_id', items.map((m) => m.id));
    res.json({ items: items.map((m) => ({ ...m, attachments: files.get(m.id) || [] })), hasMore });
  }));

  r.post('/projects/:id/messages', requireUser, limiter.limit('message', 30, 60_000, (req) => req.user.id), asyncRoute(async (req, res) => {
    const d = validator(req.body).str('body', { min: 1, max: 4000, label: 'نص الرسالة' }).done();
    const ids = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds.filter(isUuid).slice(0, 5) : [];
    const msg = await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, req.params.id, { client });
      if (!['student', 'company'].includes(role)) throw forbidden();
      if (p.status === 'cancelled') throw conflict('project_closed', 'المشروع ملغى ولا يقبل رسائل جديدة.');
      const conv = (await client.query('select id from conversations where project_id = $1', [p.id])).rows[0];
      const m = (await client.query('insert into messages (conversation_id, sender_id, body) values ($1, $2, $3) returning id, created_at as "createdAt"', [conv.id, req.user.id, d.body])).rows[0];
      await linkAttachments(client, ids, p.id, req.user.id, 'message_id', m.id);
      const other = role === 'student' ? p.company_id : p.student_id;
      await notify(ctx, client, after, { userId: other, type: 'message.new', title: `رسالة جديدة في «${p.title}»`, link: `/projects/${p.id}`, emailGroup: 'messages' });
      signal(ctx, after, [p.student_id, p.company_id], 'message', { projectId: p.id });
      return m;
    });
    res.status(201).json(msg);
  }));

  // ---------- attachments ----------
  r.post('/projects/:id/attachments', requireUser,
    limiter.limit('upload', 30, HOUR, (req) => req.user.id),
    express.raw({ type: () => true, limit: config.maxUploadBytes }),
    asyncRoute(async (req, res) => {
      const { p, role } = await loadProject(req, req.params.id);
      if (!['student', 'company'].includes(role)) throw forbidden();
      requireActive(p);
      const name = cleanFileName(req.headers['x-file-name']);
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      const type = FILE_TYPES[ext];
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!name) throw badRequest('اسم الملف مفقود.');
      if (!type) throw new HttpError(415, 'file_type', `نوع الملف غير مسموح. الأنواع المسموحة: ${ALLOWED_EXTENSIONS.join('، ')}.`);
      if (!buf.length) throw badRequest('الملف فارغ.');
      if (!type.ok(buf)) throw new HttpError(415, 'file_type', 'محتوى الملف لا يطابق امتداده.');
      const count = (await db.one('select count(*)::int as n from attachments where project_id = $1', [p.id])).n;
      if (count >= 200) throw conflict('limit', 'وصل المشروع إلى الحد الأقصى من الملفات.');

      const key = `projects/${p.id}/${crypto.randomUUID()}`;
      await storage.put(key, buf, type.mime);
      try {
        const row = await db.one(
          `insert into attachments (project_id, uploader_id, storage_key, original_name, mime_type, size_bytes)
           values ($1, $2, $3, $4, $5, $6) returning id, original_name as name, mime_type as "mimeType", size_bytes as size`,
          [p.id, req.user.id, key, name, type.mime, buf.length]);
        await audit(db, { actorId: req.user.id, action: 'attachment.uploaded', entityType: 'project', entityId: p.id, metadata: { attachmentId: row.id, size: buf.length, mime: type.mime } });
        res.status(201).json(row);
      } catch (err) {
        await storage.remove(key).catch(() => {});
        throw err;
      }
    }));

  async function loadAttachment(req, id) {
    if (!isUuid(id)) throw notFound('الملف غير موجود.');
    const a = await db.one('select * from attachments where id = $1', [id]);
    if (!a) throw notFound('الملف غير موجود.');
    const { role } = await loadProject(req, a.project_id, { allowAdmin: true });
    return { a, role };
  }

  // Issues a short-lived link bound to the requesting user.
  r.post('/attachments/:id/link', requireUser, asyncRoute(async (req, res) => {
    const { a, role } = await loadAttachment(req, req.params.id);
    if (role === 'admin') await audit(db, { actorId: req.user.id, action: 'admin.attachment_accessed', entityType: 'project', entityId: a.project_id, metadata: { attachmentId: a.id } });
    const ttl = config.fileUrlTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    let url;
    if (storage.driver === 's3') {
      url = storage.downloadUrl(a.storage_key, { filename: a.original_name, mime: a.mime_type, expires: ttl });
    } else {
      const exp = Math.floor(expiresAt.getTime() / 1000);
      url = `/api/files/${a.id}?e=${exp}&s=${hmac(config.fileUrlSecret, `${a.id}|${req.user.id}|${exp}`)}`;
    }
    res.json({ url, expiresAt, name: a.original_name, mimeType: a.mime_type });
  }));

  // Local-driver downloads: valid only with an unexpired signature for this same signed-in user.
  r.get('/files/:id', requireUser, asyncRoute(async (req, res) => {
    if (storage.driver !== 'local') throw notFound();
    const exp = Number(req.query.e);
    const sig = String(req.query.s || '');
    if (!isUuid(req.params.id) || !Number.isFinite(exp) || exp * 1000 < Date.now()) throw new HttpError(403, 'link_expired', 'انتهت صلاحية رابط التنزيل. اطلب رابطاً جديداً.');
    if (!safeEqual(sig, hmac(config.fileUrlSecret, `${req.params.id}|${req.user.id}|${exp}`))) throw forbidden('رابط التنزيل غير صالح.');
    const { a } = await loadAttachment(req, req.params.id);
    res.set({
      'Content-Type': a.mime_type,
      'Content-Disposition': contentDisposition(a.original_name),
      'Content-Length': String(a.size_bytes),
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    });
    const stream = await storage.stream(a.storage_key);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }));

  // ---------- deliverables & review ----------
  r.post('/projects/:id/deliverables', requireUser, limiter.limit('deliver', 20, HOUR, (req) => req.user.id), asyncRoute(async (req, res) => {
    const d = validator(req.body)
      .str('note', { min: 10, max: 2000, label: 'ملاحظة التسليم' })
      .list('links', { max: 10, itemMax: 500, label: 'الروابط', itemCheck: isHttpUrl })
      .done();
    const ids = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds.filter(isUuid).slice(0, 5) : [];
    if (!d.links.length && !ids.length) throw badRequest('أضف رابطاً أو ملفاً واحداً على الأقل.', { links: 'أضف رابطاً واحداً على الأقل أو أرفق ملفاً.' });
    const out = await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, req.params.id, { client, lock: true });
      if (role !== 'student') throw forbidden('يسلّم الطالب المكلّف العمل فقط.');
      if (!['in_progress', 'revision_requested'].includes(p.status)) throw conflict('invalid_transition', 'لا يمكن التسليم الآن: العمل بانتظار المراجعة أو المشروع مغلق.');
      const round = (await client.query('select coalesce(max(round), 0) + 1 as n from deliverables where project_id = $1', [p.id])).rows[0].n;
      const del = (await client.query(
        'insert into deliverables (project_id, round, note, links, submitted_by) values ($1, $2, $3, $4, $5) returning id, round',
        [p.id, round, d.note, d.links, req.user.id])).rows[0];
      await linkAttachments(client, ids, p.id, req.user.id, 'deliverable_id', del.id);
      await client.query("update projects set status = 'awaiting_review', updated_at = now() where id = $1", [p.id]);
      await notify(ctx, client, after, { userId: p.company_id, type: 'deliverable.submitted', title: `سُلّمت الجولة ${round} من «${p.title}» وتنتظر مراجعتك`, link: `/projects/${p.id}`, emailGroup: 'projects' });
      await audit(client, { actorId: req.user.id, action: 'deliverable.submitted', entityType: 'project', entityId: p.id, metadata: { round, from: p.status, to: 'awaiting_review' } });
      signal(ctx, after, [p.student_id, p.company_id], 'project', { id: p.id });
      return { ...del, status: 'awaiting_review' };
    });
    res.status(201).json(out);
  }));

  r.post('/projects/:id/request-revision', requireUser, asyncRoute(async (req, res) => {
    const d = validator(req.body).str('feedback', { min: 15, max: 2000, label: 'ملاحظات التعديل' }).done();
    await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, req.params.id, { client, lock: true });
      if (role !== 'company') throw forbidden('تطلب الشركة صاحبة المهمة التعديلات فقط.');
      if (p.status !== 'awaiting_review') throw conflict('invalid_transition', 'لا يوجد تسليم بانتظار المراجعة.');
      const last = (await client.query('select id, round from deliverables where project_id = $1 order by round desc limit 1', [p.id])).rows[0];
      await client.query("insert into deliverable_reviews (deliverable_id, decision, feedback, reviewer_id) values ($1, 'revision_requested', $2, $3)", [last.id, d.feedback, req.user.id]);
      await client.query("update projects set status = 'revision_requested', updated_at = now() where id = $1", [p.id]);
      await notify(ctx, client, after, { userId: p.student_id, type: 'deliverable.revision_requested', title: `طلبت الشركة تعديلات على «${p.title}»`, link: `/projects/${p.id}`, emailGroup: 'projects' });
      await audit(client, { actorId: req.user.id, action: 'deliverable.revision_requested', entityType: 'project', entityId: p.id, metadata: { round: last.round, from: 'awaiting_review', to: 'revision_requested' } });
      signal(ctx, after, [p.student_id, p.company_id], 'project', { id: p.id });
    });
    res.json({ ok: true, status: 'revision_requested' });
  }));

  // Completion does not touch the payment record: payment status is tracked separately.
  r.post('/projects/:id/approve', requireUser, asyncRoute(async (req, res) => {
    const d = validator(req.body).int('rating', { min: 1, max: 5, label: 'التقييم' }).str('comment', { min: 15, max: 1000, label: 'الملاحظات' }).done();
    await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, req.params.id, { client, lock: true });
      if (role !== 'company') throw forbidden('تعتمد الشركة صاحبة المهمة الإنجاز فقط.');
      if (p.status !== 'awaiting_review') throw conflict('invalid_transition', 'لا يوجد تسليم بانتظار الاعتماد.');
      const last = (await client.query('select id, round from deliverables where project_id = $1 order by round desc limit 1', [p.id])).rows[0];
      await client.query("insert into deliverable_reviews (deliverable_id, decision, feedback, reviewer_id) values ($1, 'approved', $2, $3)", [last.id, d.comment, req.user.id]);
      await client.query("update projects set status = 'completed', completed_at = now(), updated_at = now() where id = $1", [p.id]);
      await client.query('update milestones set done_at = coalesce(done_at, now()) where project_id = $1', [p.id]);
      await client.query("update tasks set status = 'completed', completed_at = now(), updated_at = now() where id = $1 and status = 'assigned'", [p.task_id]);
      await client.query('insert into reviews (project_id, reviewer_id, reviewee_id, rating, comment) values ($1, $2, $3, $4, $5)', [p.id, req.user.id, p.student_id, d.rating, d.comment]);
      await notify(ctx, client, after, { userId: p.student_id, type: 'project.completed', title: `اعتُمد إنجاز «${p.title}» وأضيف إلى ملف إنجازاتك`, link: '/portfolio', emailGroup: 'projects' });
      await audit(client, { actorId: req.user.id, action: 'project.completed', entityType: 'project', entityId: p.id, metadata: { round: last.round, rating: d.rating } });
      signal(ctx, after, [p.student_id, p.company_id], 'project', { id: p.id });
    });
    res.json({ ok: true, status: 'completed' });
  }));

  r.post('/projects/:id/review', requireUser, asyncRoute(async (req, res) => {
    const d = validator(req.body).int('rating', { min: 1, max: 5, label: 'التقييم' }).str('comment', { min: 15, max: 1000, label: 'الملاحظات' }).done();
    await db.tx(async (client, after) => {
      const { p, role } = await loadProject(req, req.params.id, { client, lock: true });
      if (role !== 'student') throw forbidden();
      if (p.status !== 'completed') throw conflict('invalid_transition', 'يمكن تقييم الشركة بعد اكتمال المشروع.');
      await client.query('insert into reviews (project_id, reviewer_id, reviewee_id, rating, comment) values ($1, $2, $3, $4, $5)', [p.id, req.user.id, p.company_id, d.rating, d.comment]);
      await notify(ctx, client, after, { userId: p.company_id, type: 'review.received', title: `قيّم الطالب تجربته في «${p.title}»`, link: `/projects/${p.id}` });
      await audit(client, { actorId: req.user.id, action: 'review.created', entityType: 'project', entityId: p.id });
    });
    res.status(201).json({ ok: true });
  }));

  return r;
}
