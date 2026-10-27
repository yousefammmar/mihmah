# Progress checklist

Status as of 2026-10-27. Each ✅ was checked by the automated tests (`npm test`, 46 passing), the two-session browser journey, or the live site. The site is live at https://mihmah.onrender.com.

## Stage 1 — Backend, database, authentication
- ✅ Express app factory, config validation, structured logging with redaction, centralised errors
- ✅ PostgreSQL schema covering users and roles, profiles, skills, tasks, applications, offers, projects, milestones, conversations and messages, deliverables and reviews, attachments, reviews, notifications and preferences, payments and payment events, reports, moderation actions, audit events
- ✅ Foreign keys, uniqueness rules, partial unique index (one accepted offer per task), check constraints, indexes
- ✅ Migration runner (advisory lock, refuses non-UTF8 databases) and development seed (fictional, refused in production)
- ✅ Registration, login, logout, email verification, password reset and change
- ✅ scrypt hashing, hashed session tokens in HttpOnly cookies, absolute and idle expiry, revocation (single session, others, all on reset or suspension)
- ✅ CSRF (allowed Origin plus a per-session header token), restricted CORS, CSP and security headers, rate limits
- ✅ Demo logins only behind `DEMO_MODE=true`, limited to `is_demo` accounts

## Stage 2 — Profiles, tasks, applications, offers
- ✅ Student and company profiles, skills, notification preferences, company verification request
- ✅ Task drafts, editing rules, publishing, cancellation (notifies applicants), deletion of drafts
- ✅ Discovery: Arabic-normalised search, combined filters, sorting, pagination, saved tasks
- ✅ Applications: submit, withdraw, duplicate and closed-task protection, company review and reject
- ✅ Offers: create, decline, withdraw, expiry, race-safe acceptance creating project, conversation, milestones and payment record

## Stage 3 — Projects, messaging, deliverables
- ✅ Workspace with server-computed allowed actions, milestones (company manages, both tick)
- ✅ Messages in the database, live updates via SSE (signals only, refetch through the API)
- ✅ Private attachments: allowlist and content sniffing, size limit, generated keys outside `public/`, user-bound short-lived links, S3 presigning
- ✅ Deliverable rounds, revision with required feedback, approval with rating, activity history
- ✅ Notifications stored and marked read. Email per preference to verified addresses.

## Stage 4 — Reviews, administration, payments boundary
- ✅ Company → student review on approval (portfolio). Optional student → company review.
- ✅ Admin: overview, company verification, reports, task moderation, suspensions with reasons, disputes (inspect, audited, cancel), audit log
- ✅ Payment records separate from project status. Provider interface, sandbox simulator, `is_live` constrained to false.
- ✅ Jordan payment provider research (`PAYMENTS-RESEARCH.md`)

## Stage 5 — Testing and deployment preparation
- ✅ Tests: auth and sessions, role and ownership access, duplicate applications, offer concurrency (5 rounds × 4 students), project transitions, private files, full end-to-end journey with backend restart
- ✅ Browser journey with two separate sessions, plus persistence after reload and full backend and database restart
- ✅ Mobile (375px) scan: no horizontal overflow, labelled controls, 44px targets on 27 pages
- ✅ API reference, state machines, deployment and backup guide, `.env.example`, Dockerfile, docker-compose
- ⚠️ Dockerfile and docker-compose are written but **not run** (no Docker on the development machine). The live site uses Render's native Node runtime instead.

## Stage 6 — QA and launch
- ✅ QA pass (gstack `/qa`, standard tier, then the Low issues): 6 findings, all fixed with regression tests where a test harness exists. Health score 97 → 100. Details in [CHANGELOG.md](CHANGELOG.md).
- ✅ Verify-banner crash ("Cannot set properties of null") fixed. Unexpected errors now show an Arabic message instead of browser text.
- ✅ Verification links: earlier emails keep working after a resend, and reopening a link of a verified account shows success.
- ✅ Free deployment: Render + Neon + Backblaze B2 + Brevo, from the GitHub `main` branch via `render.yaml`. Production-mode boot rehearsed locally with the exact settings before going live.
- ✅ Live checks: `/readyz` ready (db, smtp, s3, payments off), http → https redirect, CSP/HSTS/nosniff headers, `/dev/mail` and demo logins return 404.
- ✅ SMTP proven live: Brevo delivered verification emails from Render over port 2525.
- ⚠️ S3 storage is connected but no real upload or download has been run on the live site yet. Also check that downloads keep the original file name (B2 support for the forced-filename parameter is unconfirmed).

## Before real users sign up
- [ ] **Rotate the credentials that were exposed during setup:** the Neon password, the first Backblaze key and the Brevo SMTP key. Replace them in Render (`DATABASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_PASS`) and redeploy.
- [ ] Create the first admin from a local terminal (`npm run admin:create` against the Neon URL; see docs/DEPLOY-FREE.md step 6).
- [ ] Upload and download a file in a live project.
- [ ] Schedule `pg_dump` backups (Neon Free keeps only 6 hours of history).
- [ ] Brevo SMTP keys expire after 90 days without sending, and the current one on its set date. Note a renewal reminder.
- [ ] Optional: your own domain, for a proper email sender and a nicer URL.

## Remaining external dependencies
- Payment provider contract and CBJ licensing confirmation, then a live adapter
- A custom domain (optional), for a proper email sender address and URL
- Legal pages (terms, privacy) and tax guidance for student payouts

## Known limitations and next steps
- Rate limiter and SSE fan-out are per-process. Shared infrastructure is needed before scaling out.
- No scheduled cleanup yet for uploads that were never attached
- No university-enrolment verification (so no "verified student" badge is shown)
- No automated browser test suite. Browser checks were run manually with the in-app browser. The two UI fixes from QA (admin task view, published-edit toast) have browser evidence instead of regression tests.
- Render Free sleeps after 15 minutes idle (about a minute to wake), and Neon Free allows 100 compute hours a month. Don't keep the site awake with an uptime pinger, because it also keeps the database awake.
