# مهمّة | Mihmah

**خبرتك تبدأ بمهمّة.** Mihmah connects Jordanian university students with businesses that need short, paid digital projects.

The workflow:
1. A company publishes a task.
2. Students apply.
3. The company sends an offer.
4. The student accepts, and a project starts.
5. Both sides collaborate through messages, files and milestones.
6. The student submits work.
7. The company approves it or asks for revisions.
8. Completed work appears in the student's portfolio.

This repository is an operational MVP with three roles (student, company, admin).

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JS (ES modules, no framework or build step), Arabic RTL, the established dark tactile design |
| Backend | Node.js 22+ and Express 5 |
| Database | PostgreSQL (UTF8), plain-SQL migrations |
| Files | Private object storage (S3-compatible) with a local development adapter |
| Email | SMTP provider, with a development outbox |
| Payments | Provider interface plus a sandbox. **No live money movement.** |

## Quick start (no Docker needed)

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000.

- With no `DATABASE_URL`, `npm run dev` starts a real PostgreSQL from the `embedded-postgres` dev dependency in `.data/pg`.
- It applies migrations and seeds **fictional** demo data on first run.
- Copy `.env.example` to `.env` to change ports or turn features on. For example, `DEMO_MODE=true` shows one-click demo logins on the login page.
- Docker users can run Postgres, a mail catcher and MinIO with `docker-compose.yml` instead.

**Seeded accounts** (development and demo only; password `mihmah-demo-2026`, or `SEED_PASSWORD`):

| Role | Email |
| --- | --- |
| Student | `lian@student.example.com` (also omar, sara, yazan) |
| Company | `cafe@company.example.com` (also zaytouna, noon, darb, taboon, smile) |
| Admin | `admin@mihmah.example.com` |

**Emails** in development are written to `storage/dev-mail` and listed at http://localhost:3000/dev/mail. Open the verification and reset links from there.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server, plus embedded Postgres if `DATABASE_URL` is unset |
| `npm start` | Production server (runs migrations on start unless `MIGRATE_ON_START=false`) |
| `npm run migrate` | Apply pending migrations |
| `npm run seed:dev` | Load fictional data into an **empty** dev or demo database |
| `ADMIN_EMAIL=… npm run admin:create` | Create an administrator (prompts for the password) |
| `npm test` | 41 tests against throwaway real PostgreSQL clusters |

## What's implemented

**Accounts and security**
- Student and company registration, login and logout.
- Email verification. Applying, publishing and offering need a verified email.
- Password reset, password change, and listing and revoking sessions.
- scrypt password hashing.
- Server-side sessions in HttpOnly cookies, with absolute and idle expiry and revocation on logout, reset and suspension.
- CSRF protection: an allowed Origin plus a per-session header token.
- Restricted CORS, a strict CSP and security headers.
- Rate limits on login, registration, password flows, applications, messages and uploads.
- Parameterised SQL throughout.
- Structured logs with redaction, and centralised errors with Arabic field-level messages.

**Students**
- Profile (university, major, bio, skills, portfolio link).
- Task search (Arabic-normalised), combined filters, sorting, pagination and saved tasks.
- Apply and withdraw. Duplicate applications and applications to closed tasks are refused.
- Application and offer tracking, accepting or declining offers.
- Project workspace, portfolio, printable completion summary, notifications and email preferences.

**Companies**
- Profile and a verification request.
- Task editor with server-side drafts, editing and publishing.
- Applicant review with skill matching, offers (multiple allowed; the first acceptance wins), rejection and withdrawal.
- Milestone management, deliverable review, revision requests (feedback required), approval with a rating, and cancellation rules.

**Projects**
- Database-backed conversations, refreshed live over server-sent events.
- Private attachments: type and size checks, content sniffing, generated storage keys, short-lived links bound to the user, and upload progress with retry.
- Deliverable rounds and an activity history.

**Admin**
- Company verification (the badge appears only after an admin verifies, with a note of what was checked).
- Reports queue, task moderation, user suspension with a recorded reason, and dispute inspection and cancellation.
- Audit log, and payment records with the sandbox event simulator.

**Payments**
- Compensation fields and payment records kept separate from project status.
- A provider interface, an isolated sandbox, and live mode disabled by a schema constraint.
- The UI says "payment integration pending". Nothing is ever marked paid because someone clicked a button.

**Time**
- Stored in UTC and shown in Asia/Amman. Deadlines mean the end of the chosen day in Amman.

## Documentation

- [docs/API.md](docs/API.md): every endpoint, its auth requirement, body and errors.
- [docs/STATE-MACHINES.md](docs/STATE-MACHINES.md): task, application, offer, project, payment and report lifecycles.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production configuration, environment separation, backups and restore, release steps, go-live checklist.
- [PAYMENTS-RESEARCH.md](PAYMENTS-RESEARCH.md): Jordan payment providers, evaluated from official docs.
- [RESEARCH.md](RESEARCH.md): UX research behind the original prototype.
- [PROGRESS.md](PROGRESS.md): stage checklist and remaining external dependencies.

## Project layout

```
public/            Frontend (index.html, css/, js/views/*) — served by Express
server/
  app.js           Express app: security headers, CORS, sessions, CSRF, routes, static files
  config.js        Environment parsing; refuses unsafe production settings
  db/              pool + transactions, migration runner, migrations/*.sql, dev seed
  lib/             security, sessions, rate limits, validation, mailer, storage, payments, SSE, audit/notify
  routes/          auth, profiles, tasks (+applications/offers), projects, inbox, admin, demo
scripts/           dev launcher (embedded Postgres), create-admin
test/              node:test suites (auth, access, workflow, concurrency, files, e2e)
docs/              API, state machines, deployment
```

## External dependencies still needed

| Dependency | Status |
| --- | --- |
| Payment provider and merchant account | Not integrated. The research recommends contacting PayTabs (Jordan) and MEPS first. CBJ licensing needs confirming. |
| Production SMTP provider | Code is ready (`MAIL_PROVIDER=smtp`). Needs credentials. |
| Production S3-compatible bucket | Code is ready (`STORAGE_DRIVER=s3`). The signer is checked against the AWS example. Not yet exercised against a live bucket. |
| Hosting, TLS and a domain | Not deployed. See the checklist in `docs/DEPLOYMENT.md`. |
| Legal | Terms, privacy policy, and tax treatment of student earnings. |
