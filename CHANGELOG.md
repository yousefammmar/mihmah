# Changelog

Newest first. Each entry names its commit, so `git show <sha>` gives the full change.

## 2026-10-27 — Verification links that keep working

- **Verification links failed on the live site** with "الرابط غير صالح أو انتهت صلاحيته" (`8394626`). There were two causes:
  - Every resend cancelled all earlier links. Gmail threads these emails, so after a resend the email a user opens is often an older one. Earlier verification links now stay valid for their 24 hours, and once one is used the rest are retired. Password-reset links still replace each other.
  - Reopening a link after the account was verified returned an error. That happens with a second click, a link scanner, or another of the user's emails. It now answers `{ ok: true, alreadyVerified: true }`, and the page shows success. Unknown or forged tokens still fail.
  - Tests: `test/auth.regression-1.test.js` (new). The old "single-use" assertion in `test/auth.test.js` now checks the new contract.

## 2026-10-25 — Free deployment and launch

- **Free hosting setup** (`e87d59b`):
  - `render.yaml` is a Render Blueprint for a free web service in Frankfurt. It uses the native Node 22 runtime and a `/healthz` health check, which doesn't touch the database, so health checks don't keep Neon awake.
  - Secrets are marked `sync: false`, so they are entered in Render and never committed. Render generates `FILE_URL_SECRET` itself.
  - SMTP uses Brevo on port 2525, because Render's free plan blocks 465 and 587.
  - `docs/DEPLOY-FREE.md` walks through the five accounts and their free limits.
- **The site went live** at https://mihmah.onrender.com from the GitHub repo `yousefammmar/mihmah` (`main`). Production-mode boot was rehearsed locally with the exact `render.yaml` settings first.
- **Verify-banner crash** (`3ff2eb7`):
  - The banner's "إعادة إرسال الرابط" button read `e.currentTarget` after awaiting the request. The browser clears that value once the event finishes, so it showed "Cannot set properties of null" right after sending. The button is now captured first and disabled while sending, which also prevents double sends.
  - `reportError` now shows server and network messages, which are already in Arabic, and a plain Arabic message for anything else. The technical details go to the console instead of the screen.

## 2026-10-25 — QA pass (gstack `/qa`)

The first pass covered the API contracts and the main browser flows: 6 findings, health score 97 → 100. The Medium findings were fixed in the first pass and the Low ones right after. Each fix is its own commit, with a regression test wherever the repo has a test harness. The frontend has none, so the two UI fixes were verified in the browser.

| Issue | Severity | Problem | Fix | Commit | Test |
| --- | --- | --- | --- | --- | --- |
| ISSUE-001 | Medium | A suspended company's tasks stayed open: students could open them (200), apply (201) and accept its offers | The detail, apply and accept routes require the company account to be active. Students who already applied keep read access. | `51a27f0` | `test/tasks.regression-1.test.js` |
| ISSUE-002 | Medium | The dev mail outbox, which holds live reset links, was readable from any device on the same network | `/dev/mail` answers only loopback requests, checked on the socket address so `X-Forwarded-For` can't spoof it | `67076cb` | `test/app.regression-1.test.js` |
| ISSUE-003 | Medium | Admins got a "students only" page when opening a reported task from the reports queue | `#/tasks/:id` is open to every signed-in role. The page is read-only for admins and companies, with a role-appropriate back link. | `e9f1edc` | Browser-verified |
| ISSUE-004 | Low | Validation messages used the wrong grammatical gender ("نوع الحساب غير صالحة", "النبذة مطلوب") | Messages are phrased so they read correctly for any field name ("يرجى إدخال …", "اختر … من الخيارات المتاحة", "عدد أحرف …") | `373d973` | `test/validate.regression-1.test.js` |
| ISSUE-005 | Low | Milestone PATCH was all-or-nothing: a date-only edit failed, and a title-only edit silently cleared the date | Only the fields that were sent change. `dueDate: null` still clears the date. | `f7296de` | `test/projects.regression-1.test.js` |
| ISSUE-006 | Low | Editing an already-published task showed "نُشرت المهمة" | Only a first publish is announced as one. Edits say "حُفظت التعديلات." | `ed9bd1d` | Browser-verified |

The QA working files (probe receipts, screenshots) stay out of Git under `.gstack/`, because they contain local session tokens.

## 2026-10-25 — Operational MVP

- **Express 5 + PostgreSQL backend** (`e9a08a2`):
  - Real accounts for students, companies and admins: email verification, password reset, sessions, CSRF protection and rate limits.
  - Tasks, applications and offers, with race-safe acceptance.
  - Projects with messages, private files, milestones, deliverables, revisions and reviews.
  - Notifications, an admin console and a sandbox-only payments boundary.
  - API docs, state machines, a deployment guide, Docker files and 41 tests.

## 2026-10-24 — Interactive prototype

- **Static Arabic RTL prototype** in HTML, CSS and vanilla JS, with local demo data (`01e927b`). The UX research is in `RESEARCH.md`.
