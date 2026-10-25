# Mihmah API reference

Base path: `/api`. JSON in, JSON out (UTF-8). This file lists all 78 endpoints, generated from `server/routes/*.js`.

## Conventions

**Authentication**
- `POST /auth/login` and `POST /auth/register` set an HttpOnly cookie, `mihmah_sid` by default, with SameSite=Lax and the `Secure` flag in production.
- The cookie holds a random token. The database stores only its SHA-256 hash.
- Sessions expire after `SESSION_TTL_HOURS` (absolute) or `SESSION_IDLE_HOURS` of inactivity, and can be revoked.

**CSRF**
- Every `POST/PUT/PATCH/DELETE` must send an `Origin` header listed in `ALLOWED_ORIGINS`.
- When signed in, it must also send `X-CSRF-Token: <csrf>`. The `csrf` value comes from `GET /auth/session`, login or register.

**Roles**
- `student`, `company` or `admin`.
- *verified* means the endpoint also requires a confirmed email (`403 email_unverified` otherwise).

**Errors**

```json
{ "error": { "code": "validation", "message": "يرجى تصحيح الحقول المشار إليها.", "fields": { "proposal": "العرض قصير: 12 من 50 حرفاً على الأقل." } } }
```

- Messages are in Arabic and safe to show. `fields` maps input names to messages for inline display.
- Common codes:

| Status | Code(s) |
| --- | --- |
| 400 | `validation`, `invalid_token` |
| 401 | `unauthorized`, `bad_credentials` |
| 403 | `forbidden`, `csrf`, `bad_origin`, `email_unverified`, `suspended`, `link_expired` |
| 404 | `not_found` |
| 409 | `duplicate_application`, `task_closed`, `task_taken`, `offer_expired`, `invalid_transition`, `not_editable`, `duplicate_report`, `payments_unavailable` |
| 413 | `too_large` |
| 415 | `file_type` |
| 429 | `rate_limited` (with a `Retry-After` header) |

**Privacy:** resources you cannot access return `404`, so private records don't reveal that they exist.

**Pagination:** list endpoints accept `page` (1-based) and `pageSize`, and return `{ items, page, pageSize, total, pages }`.

**Time:** all timestamps are ISO-8601 UTC. Date inputs (`deadline`, `dueDate`) are `YYYY-MM-DD` and mean the end of that day in Asia/Amman.

**Rate limits:** in-memory, per instance.

| Action | Limit |
| --- | --- |
| Register | 10/h per IP |
| Login | 30/15 min per IP and 8/15 min per email |
| Forgot password | 10/h per IP and 3/h per email |
| Reset password | 10/h per IP |
| Verify email | 20/h per IP |
| Resend verification | 3/h per user |
| Apply | 20/h per user |
| Create task | 30/h per user |
| Messages | 30/min per user |
| Uploads | 30/h per user |
| Deliverables | 20/h per user |
| Reports | 10/day per user |

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/healthz` | — | Liveness: `{ status: "ok" }` |
| GET | `/readyz` | — | Readiness: checks the database. `503` if it's unreachable. Also reports which mail, storage and payment drivers are active. |

## Auth & sessions (`/api/auth`)

| Method | Path | Auth | Body → Response |
| --- | --- | --- | --- |
| GET | `/auth/session` | optional | → `{ user \| null, csrf, demoMode, payments: { provider, live:false }, mailPreview }` |
| POST | `/auth/register` | — | `{ role: student\|company, email, password (≥10), name, companyName? }` → 201, session payload. Sends a verification email. |
| POST | `/auth/login` | — | `{ email, password }` → session payload. Same 401 for an unknown email and a wrong password. |
| POST | `/auth/logout` | user | Revokes the current session. |
| GET | `/auth/sessions` | user | → `{ items: [{ id, createdAt, lastSeenAt, expiresAt, userAgent, current }] }` |
| DELETE | `/auth/sessions/:id` | user | Revokes one of your sessions. |
| POST | `/auth/logout-others` | user | Revokes every session except the current one. |
| POST | `/auth/verify-email` | — | `{ token }`. Single-use, valid 24 h. |
| POST | `/auth/resend-verification` | user | Issues a new link. |
| POST | `/auth/forgot-password` | — | `{ email }`. Always returns the same response. Reset link valid 1 h. |
| POST | `/auth/reset-password` | — | `{ token, password }`. Revokes all of the user's sessions. |
| POST | `/auth/change-password` | user | `{ currentPassword, newPassword }`. Revokes your other sessions. |

## Profiles, skills, dashboard

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/me` | user | Account summary: `id, email, role, name, emailVerified, isDemo, verificationStatus` |
| GET | `/me/profile` | user | Students get their profile, skills, completed projects with reviews, and average rating. Companies get their profile and verification status. |
| PUT | `/me/profile` | student, company | Student: `{ fullName, university, major, bio (20–1000), portfolioUrl?, skills[1–12] }`. Company: `{ companyName, contactName, industry, city, bio }`. Renaming a verified company resets its verification. |
| POST | `/me/verification-request` | company | `unverified\|rejected → pending`. Requires a complete profile. |
| GET / PUT | `/me/notification-preferences` | user | `{ applications, offers, projects, messages }` email toggles |
| GET | `/skills?q=` | user | Skill names, most used first |
| GET | `/students/:id` | company, admin, self | Public portfolio (other students get 403). |
| GET | `/companies/:id` | user | Public company profile: `verified` flag, task count, average rating |
| GET | `/dashboard` | student, company | Counts computed from stored rows |

## Tasks

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/tasks` | user | Published, visible tasks whose deadline hasn't passed. Filters: `q` (Arabic-normalised search over title, summary, company, city, skills), `category`, `skills` (comma list, any match), `budgetMin`, `budgetMax`, `durationMin`, `durationMax`, `saved=1`, `sort=newest\|budget_desc\|budget_asc\|deadline`. Each item includes `saved` and `myApplicationStatus`. |
| GET | `/tasks/:id` | user | Detail, plus `myApplication` (with offer and project) for students, and `applicantCount`, `canEdit`, `isOwner`. Drafts are visible only to their owner. |
| GET | `/company/tasks?status=` | company | Your tasks with applicant, submitted, pending-offer counts and `projectId` |
| POST | `/tasks` | company | `{ title (10–90), category, summary (30–300), scope (40–2000), deliverables[1–8], skills[1–8], milestones[1–6], budget (10–2000 JOD), durationDays (1–60), deadline: YYYY-MM-DD, publish?: bool }` → `{ id, status }`. `publish: true` requires a verified email. |
| PATCH | `/tasks/:id` | owner company | Same body. Only while `draft`, or `published` with no applications. |
| POST | `/tasks/:id/publish` | owner company, verified | `draft → published` |
| DELETE | `/tasks/:id` | owner company | Drafts only |
| POST | `/tasks/:id/cancel` | owner company | `{ reason }`. `draft\|published → cancelled`. Rejects applications and withdraws offers. |
| PUT / DELETE | `/tasks/:id/save` | student | Save or unsave |

## Applications & offers

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/tasks/:id/applications` | student, verified | `{ proposal (50–2000), portfolioUrl?, deliveryDays (≤ task duration) }` → 201. 409 if it's a duplicate or the task is closed. |
| GET | `/me/applications` | student | Your applications with task, company, offer status and expiry, and `projectId` |
| POST | `/applications/:id/withdraw` | owning student | `submitted → withdrawn` |
| GET | `/tasks/:id/applications` | owner company | Applicants with profile summary, skills, completed-project count and offer status |
| POST | `/applications/:id/reject` | owner company | `submitted → rejected` |
| POST | `/applications/:id/offer` | owner company, verified | `{ message? }` → offer `{ id, status: pending, expiresAt }`. The application becomes `offered`. |
| POST | `/offers/:id/accept` | offered student, verified | Locked transaction: offer `accepted`, task `assigned`, other offers `withdrawn`, remaining applications `rejected`, and the project, conversation, milestones and payment record are created → `{ projectId }`. 409 `task_taken` or `offer_expired`. |
| POST | `/offers/:id/decline` | offered student | `pending → declined` |
| POST | `/offers/:id/withdraw` | owner company | `pending → withdrawn` |

## Projects, milestones, messages, files

A project is visible to its two participants. Admins can also view it, and every admin view is audited. Everyone else gets 404.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/projects` | student, company | Your projects with status, payment status and milestone progress |
| GET | `/projects/:id` | participants, admin | Task brief, student, company, milestones, deliverables (with reviews and attachment metadata), payment, reviews, `viewerRole`, and `actions` (what the viewer may do now) |
| GET | `/projects/:id/activity` | participants, admin | History from audit events (admin-internal actions excluded) |
| POST | `/projects/:id/milestones` | owner company | `{ title, dueDate? }`. Active projects only, at most 12. |
| PATCH | `/milestones/:id` | participants | `{ done }` (either side). `{ title, dueDate }` is company only. Active projects only. |
| DELETE | `/milestones/:id` | owner company | Active projects only |
| GET | `/projects/:id/messages?before=&limit=` | participants, admin | `{ items: [{ id, body, senderRole, createdAt, attachments }], hasMore }` (oldest first) |
| POST | `/projects/:id/messages` | participants | `{ body (1–4000), attachmentIds?[] }`. Not allowed on cancelled projects. |
| POST | `/projects/:id/attachments` | participants | **Raw body** (not JSON) with headers `Content-Type` and `X-File-Name: <URI-encoded name>`. Max `MAX_UPLOAD_MB`. Allowed extensions: png, jpg/jpeg, webp, gif, pdf, zip, docx, xlsx, pptx, csv, txt, and the content must match the type. → 201 `{ id, name, mimeType, size }`. Uploads start unlinked: attach them to one message or deliverable by id. |
| POST | `/attachments/:id/link` | participants, admin | → `{ url, expiresAt }`. A short-lived link (`FILE_URL_TTL_SECONDS`). Local storage: an HMAC-signed `/api/files/:id` link, valid only for the same signed-in user. S3: a presigned GET that forces download. |
| GET | `/files/:id?e=&s=` | the user the link was issued to | Streams the file with `Content-Disposition: attachment`, `nosniff` and a sandbox CSP |
| POST | `/projects/:id/deliverables` | assigned student | `{ note (10–2000), links[0–10], attachmentIds[0–5] }`, needing at least one link or file. `in_progress\|revision_requested → awaiting_review` |
| POST | `/projects/:id/request-revision` | owner company | `{ feedback (≥15) }`. `awaiting_review → revision_requested` |
| POST | `/projects/:id/approve` | owner company | `{ rating 1–5, comment (≥15) }`. `awaiting_review → completed`. Payment status is unchanged. |
| POST | `/projects/:id/review` | assigned student | `{ rating, comment }`. Once, after completion. |

## Notifications, live updates, reports

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/notifications` | user | Paginated, plus `unread` count |
| POST | `/notifications/:id/read`, `/notifications/read-all` | user | Mark as read |
| GET | `/events` | user | **Server-sent events** stream. Events `notification`, `message` (`{ projectId }`) and `project` (`{ id }`) are signals only, so clients refetch through the normal API. Heartbeat every 25 s. The browser `EventSource` reconnects automatically. |
| POST | `/reports` | user | `{ targetType: task\|user\|project, targetId, reason: spam\|fraud\|inappropriate\|dispute\|other, details (10–2000) }`. Projects can only be reported by their participants. One open report per target per user. |

## Admin (`/api/admin`, admin role)

Every mutating admin call requires a written reason or note. It is stored in `moderation_actions` and `audit_events`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/overview` | Platform counts |
| GET | `/admin/companies?status=` | Companies with verification state |
| POST | `/admin/companies/:id/verification` | `{ decision: verified\|rejected, note (≥10, what was checked) }` |
| GET | `/admin/reports?status=` | Reports with a resolved target label |
| POST | `/admin/reports/:id/resolve` | `{ status: resolved\|dismissed, note }` |
| GET | `/admin/tasks?moderation=&q=` | Non-draft tasks, those with open reports first |
| POST | `/admin/tasks/:id/moderation` | `{ action: hide\|unhide, reason }` |
| GET | `/admin/users?role=&status=&q=` | Users |
| POST | `/admin/users/:id/suspend`, `/reinstate` | `{ reason }`. Suspending revokes every session immediately. Admin accounts cannot be suspended here. |
| GET | `/admin/projects?disputed=1` | Projects with open-dispute counts |
| POST | `/admin/projects/:id/cancel` | `{ reason }`. Resolves a dispute: project and task are cancelled, and the payment is cancelled if money never moved. |
| GET | `/admin/audit?entityId=&actorId=` | Audit log, newest first |
| GET | `/admin/payments` | Payment records, provider, and the list of sandbox event types |
| POST | `/admin/payments/:id/sandbox-event` | `{ type }`. **Sandbox only** (`PAYMENTS_PROVIDER=sandbox`). Simulates a provider webhook and rejects invalid transitions. |

## Demo (`/api/demo`, mounted only when `DEMO_MODE=true`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/demo/login` | `{ account: student\|company\|admin }`. Signs into the seeded accounts flagged `is_demo`. Run this only in a separate demo environment with its own database. |

## Development only

| Method | Path | Description |
| --- | --- | --- |
| GET | `/dev/mail` | Local outbox viewer for `MAIL_PROVIDER=dev`. Never mounted when `NODE_ENV=production`. |
