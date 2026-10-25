import express from 'express';
import { asyncRoute, notFound, forbidden, HttpError } from '../lib/errors.js';
import { validator, isUuid } from '../lib/validate.js';
import { requireUser, requireRole } from '../lib/sessions.js';
import { audit } from '../lib/activity.js';
import { accountSummary } from './auth.js';

export const CITIES = ['عمّان', 'إربد', 'الزرقاء', 'السلط', 'العقبة', 'مادبا', 'الكرك', 'جرش', 'المفرق', 'عجلون', 'معان', 'الطفيلة'];

// Finds or creates skills case-insensitively and returns their ids in input order.
export async function upsertSkills(client, names) {
  const ids = [];
  for (const name of names) {
    const row = (await client.query(
      `with ins as (insert into skills (name) values ($1) on conflict (lower(name)) do nothing returning id)
       select id from ins union all select id from skills where lower(name) = lower($1) limit 1`,
      [name],
    )).rows[0];
    ids.push(row.id);
  }
  return ids;
}

export async function studentPortfolio(db, studentId) {
  const profile = await db.one(
    `select u.id, sp.full_name as "fullName", sp.university, sp.major, sp.bio, sp.portfolio_url as "portfolioUrl",
            (u.email_verified_at is not null) as "emailVerified", u.is_demo as "isDemo",
            coalesce((select array_agg(s.name order by s.name) from student_skills ss join skills s on s.id = ss.skill_id where ss.student_id = u.id), '{}') as skills
       from users u join student_profiles sp on sp.user_id = u.id where u.id = $1 and u.status = 'active'`,
    [studentId],
  );
  if (!profile) return null;
  const { rows: projects } = await db.query(
    `select p.id, p.completed_at as "completedAt", t.title, t.category, cp.company_name as "companyName", cp.city,
            coalesce((select array_agg(s.name order by s.name) from task_skills ts join skills s on s.id = ts.skill_id where ts.task_id = t.id), '{}') as skills,
            r.rating, r.comment,
            (select d.links from deliverables d where d.project_id = p.id order by d.round desc limit 1) as links
       from projects p
       join tasks t on t.id = p.task_id
       join company_profiles cp on cp.user_id = p.company_id
       left join reviews r on r.project_id = p.id and r.reviewee_id = p.student_id
      where p.student_id = $1 and p.status = 'completed'
      order by p.completed_at desc`,
    [studentId],
  );
  const rated = projects.filter((p) => p.rating);
  return { ...profile, projects, averageRating: rated.length ? Number((rated.reduce((a, p) => a + p.rating, 0) / rated.length).toFixed(1)) : null };
}

export default function profileRoutes(ctx) {
  const { db } = ctx;
  const r = express.Router();

  r.get('/skills', requireUser, asyncRoute(async (req, res) => {
    const q = String(req.query.q || '').slice(0, 40);
    const { rows } = await db.query(
      `select s.name from skills s left join task_skills ts on ts.skill_id = s.id
        where ($1 = '' or s.name ilike '%' || $1 || '%') group by s.id order by count(ts.task_id) desc, s.name limit 40`,
      [q],
    );
    res.json({ items: rows.map((x) => x.name) });
  }));

  r.get('/me', requireUser, asyncRoute(async (req, res) => res.json(await accountSummary(db, req.user.id))));

  r.get('/me/profile', requireUser, asyncRoute(async (req, res) => {
    if (req.user.role === 'student') return res.json(await studentPortfolio(db, req.user.id));
    if (req.user.role === 'company') {
      return res.json(await db.one(
        `select user_id as id, company_name as "companyName", contact_name as "contactName", industry, city, bio,
                verification_status as "verificationStatus", verification_note as "verificationNote", verified_at as "verifiedAt"
           from company_profiles where user_id = $1`, [req.user.id]));
    }
    res.json(await accountSummary(db, req.user.id));
  }));

  r.put('/me/profile', requireRole('student', 'company'), asyncRoute(async (req, res) => {
    if (req.user.role === 'student') {
      const d = validator(req.body)
        .str('fullName', { min: 2, max: 100, label: 'الاسم الكامل' })
        .str('university', { min: 2, max: 120, label: 'الجامعة' })
        .str('major', { min: 2, max: 120, label: 'التخصص' })
        .str('bio', { min: 20, max: 1000, label: 'النبذة' })
        .url('portfolioUrl', { label: 'رابط الأعمال' })
        .list('skills', { min: 1, max: 12, itemMax: 40, label: 'المهارات' })
        .done();
      await db.tx(async (client) => {
        await client.query(
          'update student_profiles set full_name = $2, university = $3, major = $4, bio = $5, portfolio_url = $6, updated_at = now() where user_id = $1',
          [req.user.id, d.fullName, d.university, d.major, d.bio, d.portfolioUrl],
        );
        const ids = await upsertSkills(client, [...new Map(d.skills.map((s) => [s.toLowerCase(), s])).values()]);
        await client.query('delete from student_skills where student_id = $1', [req.user.id]);
        await client.query('insert into student_skills (student_id, skill_id) select $1, unnest($2::int[])', [req.user.id, ids]);
      });
    } else {
      const d = validator(req.body)
        .str('companyName', { min: 2, max: 120, label: 'اسم الشركة' })
        .str('contactName', { min: 2, max: 100, label: 'اسم المسؤول' })
        .str('industry', { min: 2, max: 60, label: 'القطاع' })
        .oneOf('city', CITIES, { label: 'المدينة' })
        .str('bio', { min: 20, max: 1000, label: 'النبذة' })
        .done();
      // Renaming a verified company sends it back to unverified: the badge must match what was checked.
      await db.query(
        `update company_profiles set
           verification_status = case when company_name <> $2 and verification_status = 'verified' then 'unverified' else verification_status end,
           verified_at = case when company_name <> $2 and verification_status = 'verified' then null else verified_at end,
           verified_by = case when company_name <> $2 and verification_status = 'verified' then null else verified_by end,
           company_name = $2, contact_name = $3, industry = $4, city = $5, bio = $6, updated_at = now()
         where user_id = $1`,
        [req.user.id, d.companyName, d.contactName, d.industry, d.city, d.bio],
      );
    }
    res.json(await accountSummary(db, req.user.id));
  }));

  r.post('/me/verification-request', requireRole('company'), asyncRoute(async (req, res) => {
    const row = await db.one(
      `update company_profiles set verification_status = 'pending', updated_at = now()
        where user_id = $1 and verification_status in ('unverified', 'rejected') and industry is not null and city is not null
        returning verification_status`, [req.user.id]);
    if (!row) throw new HttpError(409, 'invalid_state', 'أكمل ملف الشركة أولاً، أو أن طلب التوثيق قيد المراجعة بالفعل.');
    await audit(db, { actorId: req.user.id, action: 'company.verification_requested', entityType: 'user', entityId: req.user.id });
    res.json({ verificationStatus: row.verification_status });
  }));

  r.get('/me/notification-preferences', requireUser, asyncRoute(async (req, res) => {
    const row = await db.one(
      `insert into notification_preferences (user_id) values ($1) on conflict (user_id) do update set user_id = excluded.user_id
       returning email_applications as applications, email_offers as offers, email_projects as projects, email_messages as messages`, [req.user.id]);
    res.json(row);
  }));

  r.put('/me/notification-preferences', requireUser, asyncRoute(async (req, res) => {
    const d = validator(req.body).bool('applications').bool('offers').bool('projects').bool('messages').done();
    const row = await db.one(
      `insert into notification_preferences (user_id, email_applications, email_offers, email_projects, email_messages) values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set email_applications = $2, email_offers = $3, email_projects = $4, email_messages = $5, updated_at = now()
       returning email_applications as applications, email_offers as offers, email_projects as projects, email_messages as messages`,
      [req.user.id, d.applications, d.offers, d.projects, d.messages]);
    res.json(row);
  }));

  // Portfolios are visible to companies, admins and the student themself (not to other students).
  r.get('/students/:id', requireUser, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    if (req.user.role === 'student' && req.user.id !== req.params.id) throw forbidden('ملفات الطلاب الآخرين غير متاحة لحسابات الطلاب.');
    const p = await studentPortfolio(db, req.params.id);
    if (!p) throw notFound('الطالب غير موجود.');
    res.json(p);
  }));

  r.get('/companies/:id', requireUser, asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const c = await db.one(
      `select cp.user_id as id, cp.company_name as "companyName", cp.industry, cp.city, cp.bio,
              (cp.verification_status = 'verified') as verified, u.is_demo as "isDemo",
              (select count(*)::int from tasks t where t.company_id = cp.user_id and t.status in ('published', 'assigned', 'completed') and t.moderation_status = 'visible') as "taskCount",
              (select round(avg(r.rating), 1) from reviews r where r.reviewee_id = cp.user_id) as "averageRating"
         from company_profiles cp join users u on u.id = cp.user_id where cp.user_id = $1 and u.status = 'active'`, [req.params.id]);
    if (!c) throw notFound('الشركة غير موجودة.');
    res.json(c);
  }));

  // Every number is a count over stored rows; nothing is cached or duplicated.
  r.get('/dashboard', requireUser, asyncRoute(async (req, res) => {
    const id = req.user.id;
    if (req.user.role === 'student') {
      return res.json(await db.one(
        `select
           (select count(*)::int from applications where student_id = $1 and status = 'submitted') as "pendingApplications",
           (select count(*)::int from offers where student_id = $1 and status = 'pending' and expires_at > now()) as "pendingOffers",
           (select count(*)::int from projects where student_id = $1 and status in ('in_progress', 'awaiting_review', 'revision_requested')) as "activeProjects",
           (select count(*)::int from projects where student_id = $1 and status = 'completed') as "completedProjects",
           (select count(*)::int from saved_tasks st join tasks t on t.id = st.task_id where st.student_id = $1 and t.status = 'published') as "savedTasks",
           (select count(*)::int from notifications where user_id = $1 and read_at is null) as "unreadNotifications"`, [id]));
    }
    if (req.user.role === 'company') {
      return res.json(await db.one(
        `select
           (select count(*)::int from tasks where company_id = $1 and status = 'draft') as "draftTasks",
           (select count(*)::int from tasks where company_id = $1 and status = 'published') as "publishedTasks",
           (select count(*)::int from applications a join tasks t on t.id = a.task_id where t.company_id = $1 and t.status = 'published' and a.status = 'submitted') as "pendingApplicants",
           (select count(*)::int from offers where company_id = $1 and status = 'pending' and expires_at > now()) as "pendingOffers",
           (select count(*)::int from projects where company_id = $1 and status in ('in_progress', 'awaiting_review', 'revision_requested')) as "activeProjects",
           (select count(*)::int from projects where company_id = $1 and status = 'awaiting_review') as "awaitingReview",
           (select count(*)::int from notifications where user_id = $1 and read_at is null) as "unreadNotifications"`, [id]));
    }
    res.json({});
  }));

  return r;
}
