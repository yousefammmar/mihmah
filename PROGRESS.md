# Progress checklist

Status as of 2026-10-25. Each ✅ was checked by the automated tests (`npm test`, 41 passing) and/or the two-session browser journey.

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
- ⚠️ Dockerfile and docker-compose are written but **not run** (no Docker on the development machine)
- ⚠️ S3 adapter checked against the AWS SigV4 example. **Not run against a real bucket.**
- ⚠️ SMTP adapter not run against a real provider (dev outbox used throughout)

## Remaining external dependencies
- Payment provider contract and CBJ licensing confirmation, then a live adapter
- Production SMTP credentials, S3 bucket, hosting, TLS and domain
- Legal pages (terms, privacy) and tax guidance for student payouts

## Known limitations and next steps
- Rate limiter and SSE fan-out are per-process. Shared infrastructure is needed before scaling out.
- No scheduled cleanup yet for uploads that were never attached
- No university-enrolment verification (so no "verified student" badge is shown)
- No automated browser test suite. Browser checks were run manually with the in-app browser.
