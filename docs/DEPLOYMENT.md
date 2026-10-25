# Deployment, configuration and operations

For a no-cost setup (Render + Neon + Backblaze B2 + Brevo, code on GitLab), follow [DEPLOY-FREE.md](DEPLOY-FREE.md).

Nothing has been deployed. This guide and its checklist are for review. Deploying, spending money and touching production data all need an explicit go-ahead.

## Architecture

```
Browser (public/: vanilla HTML/CSS/JS, hash routes)
   │  HTTPS, same origin, HttpOnly session cookie + X-CSRF-Token
   ▼
Node.js + Express (server/)
   ├─ PostgreSQL ≥ 15, UTF8   — all records, sessions, notifications, audit log
   ├─ Private object storage   — attachments (S3-compatible; local dir in development only)
   ├─ SMTP provider            — verification, password reset, notification emails
   └─ Payment provider         — NOT integrated (interface + sandbox only; see PAYMENTS-RESEARCH.md)
```

Express serves `public/` and the API from one origin, so the browser needs no CORS. The server also sends a strict CSP, HSTS in production, `nosniff` and a no-store API cache policy.

**Single-instance limits.** Two pieces of state live in process memory:
- the rate limiter (`server/lib/rateLimit.js`)
- the SSE fan-out (`server/lib/events.js`)

To run several instances, move rate limits to Redis or Postgres and push events through Postgres `LISTEN/NOTIFY` or Redis pub/sub. Both files carry a `ponytail:` note marking this.

## Environments and data separation

| Environment | Database | Files | Mail | Payments | Notes |
| --- | --- | --- | --- | --- | --- |
| development | embedded PG in `.data/pg`, or your own `DATABASE_URL` | `storage/private` (local) | dev outbox at `/dev/mail` | `none` or `sandbox` | Fictional seed loads automatically on first run. |
| test | a throwaway embedded PG per test file, deleted afterwards | temp dir | temp outbox | `sandbox` | `npm test`. Never touches dev or prod. |
| demo (optional) | **its own** database | its own bucket | SMTP or none | `sandbox` | `DEMO_MODE=true` plus `npm run seed:dev`. One-click logins for `is_demo` accounts only. |
| production | managed PostgreSQL | private S3 bucket | SMTP (required) | `none` until a provider is contracted | The server refuses unsafe settings at startup (`server/config.js`). |

Never point a demo or development server at the production database. `seed-dev` refuses to run on production unless `DEMO_MODE=true`.

## Production configuration

Startup fails with a list of problems if any of these are missing or unsafe:

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | Public `https://` origin. Used in email links and as the default allowed Origin. |
| `ALLOWED_ORIGINS` | Usually the same as `APP_URL`. Comma-separate extra trusted origins. |
| `TRUST_PROXY` | `true` behind a load balancer or reverse proxy, so rate limits see real client IPs. |
| `DATABASE_URL` | PostgreSQL with **UTF8 encoding** (migrations refuse anything else). Use TLS (`?sslmode=require`) for managed databases. |
| `FILE_URL_SECRET` | 32+ random characters, e.g. `openssl rand -hex 32`. Rotating it invalidates outstanding download links (2 min by default). |
| `MAIL_PROVIDER=smtp` + `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | A transactional email provider with SPF/DKIM set up for the `MAIL_FROM` domain. |
| `STORAGE_DRIVER=s3` + `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | A **private** bucket with public access blocked and encryption at rest. The credentials should be limited to `GetObject`/`PutObject`/`DeleteObject` on that bucket. |
| `COOKIE_SECURE` | Defaults to `true` and cannot be disabled in production. |
| `PAYMENTS_PROVIDER` | `none`. Sandbox is refused in production unless `DEMO_MODE=true`. |
| Optional | `SESSION_TTL_HOURS` (168), `SESSION_IDLE_HOURS` (48), `MAX_UPLOAD_MB` (10), `FILE_URL_TTL_SECONDS` (120), `OFFER_TTL_HOURS` (72), `PLATFORM_FEE_PERCENT` (10), `LOG_LEVEL` |

Keep secrets in the hosting platform's secret store, never in Git. `.env` is gitignored, and `.env.example` contains placeholders only.

## Release procedure

1. `npm ci --omit=dev` (or build the `Dockerfile`).
2. `NODE_ENV=production npm run migrate`. This is idempotent and serialised by an advisory lock. The server also migrates on start unless `MIGRATE_ON_START=false`.
3. First release only: `ADMIN_EMAIL=you@example.com npm run admin:create` (it prompts for a password of 12+ characters). Admins cannot self-register.
4. `npm start`. Wire `/healthz` (liveness) and `/readyz` (readiness, which checks the database) into the platform.
5. Smoke test: register a test company and a test student on a staging copy and run the journey from the README.

## Logs

Logs are JSON lines on stdout: request id, method, path (without query string), status, duration, user id. Keys matching `pass|token|secret|cookie|csrf|body|content|proposal|note` are redacted. Request bodies and message text are never logged.

## Backups and restore

**PostgreSQL**
- Use the provider's automated backups with point-in-time recovery.
- Also take a logical dump nightly:

  ```bash
  pg_dump --format=custom --no-owner --file="backups/mihmah-$(date +%F).dump" "$DATABASE_URL"
  ```

- Restore into a **new** database, then repoint `DATABASE_URL`:

  ```bash
  createdb --encoding=UTF8 --template=template0 mihmah_restore
  pg_restore --no-owner --dbname=mihmah_restore backups/mihmah-YYYY-MM-DD.dump
  ```

- Test a restore at least monthly, and record the date in the ops log.

**Object storage**
- Enable bucket versioning and a lifecycle rule for non-current versions.
- Replicate or back up the bucket on the same schedule as the database. `attachments.storage_key` must keep matching existing objects.
- Unlinked uploads (files never attached to a message or deliverable) can be cleaned up after 24 h with a scheduled job. That job is not implemented yet.

**Local embedded development database**
- It lives in `.data/pg`.
- To dump it, use the bundled binaries in `node_modules/@embedded-postgres/<platform>/native/bin/` with `postgres://mihmah:mihmah-local-dev@127.0.0.1:54329/mihmah_dev`.
- Deleting `.data/pg` resets local data. Dev only.

## Enabling real payments (future)

Read `PAYMENTS-RESEARCH.md` first. Then:
1. Choose a provider whose official documentation covers Jordanian collection, split payouts to individuals, refunds and holds.
2. Sign the merchant agreement.
3. Confirm the licensing position with the CBJ.
4. Add a new adapter behind `server/lib/payments.js`, with webhook signature verification and idempotency keys.
5. Add a migration that relaxes `is_live` only for that provider.
6. Review the change.

Until all of that is done, `PAYMENTS_PROVIDER=none` and the UI keeps saying that payment integration is pending.

## Deployment checklist (review before go-live)

- [ ] Production PostgreSQL created with UTF8 encoding, TLS, automated backups and PITR. A restore drill has been run.
- [ ] Private S3 bucket: public access blocked, encryption, versioning, least-privilege credentials.
- [ ] SMTP provider verified (SPF, DKIM, DMARC). Test emails delivered to Gmail and Outlook.
- [ ] `FILE_URL_SECRET` generated and stored in the secret manager. No secrets in the repository (`git log -p | grep -i secret` is clean).
- [ ] `APP_URL` is https, TLS certificate valid, HSTS acceptable for the domain, `TRUST_PROXY` set correctly.
- [ ] `npm test` passes on the release commit (41 tests at the time of writing).
- [ ] `npm run migrate` applied. `/readyz` returns `db: "ok"`.
- [ ] Admin account created via CLI. A second admin is planned for redundancy.
- [ ] `DEMO_MODE` is **false**, and the seed was **not** run against production.
- [ ] `PAYMENTS_PROVIDER=none`. The UI shows "بانتظار ربط مزوّد الدفع".
- [ ] Log shipping and alerting on 5xx rates and `/readyz` failures.
- [ ] Privacy policy and terms published (legal review, not included here).
- [ ] Single instance confirmed, or the rate limiter and SSE moved to shared infrastructure before scaling out.
