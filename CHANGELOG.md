# Changelog

Newest first. Each entry names its commit, so `git show <sha>` gives the full change.

## 2026-10-28 — Every university in Jordan

- **University suggestions on student profiles:** up from 10 to 42 entries.
  - All 10 public, 18 private, 2 special-law and 1 regional university, plus the University of Jordan's Aqaba branch and the accredited university colleges.
  - Names follow their official Arabic forms, checked against the Arabic Wikipedia list and an accreditation directory.
  - The original 10 keep their exact spelling, so existing profiles still match. Students can still type any name.

## 2026-10-27 — Dropdowns in light mode on phones

- **City field and other dropdowns:** the arrow was an image with a fixed dark-theme grey (`#B9BEC6`). On the light field (`#E6E9ED`) it measured about 1.4:1 and was nearly invisible. It's now a theme token: `#434A54` in light (7.35:1), unchanged in dark (8.94:1).
- **The open list:** with the phone in dark mode and the site in light mode, choosing a city showed dark text on a dark list, unreadable. Android draws the open list in the phone's own theme and ignores the option background, but it keeps the text color the site sets, which was dark for the light theme. The list now follows the device theme instead: `color-scheme: light dark` on the dropdown, with `Canvas`/`CanvasText` system colors on the options. The result is white text on a dark list or black on a light one in all four phone/site combinations (checked by emulating each), while the closed field keeps the site theme.
- **Date pickers:** the calendar icon was inverted for dark mode, which made it pale in light mode. It's no longer inverted in light mode.
- **Sticky headers on iPhone:** added `-webkit-backdrop-filter`, so they blur the content behind them on iOS Safari before version 18.

## 2026-10-27 — Google Analytics, without leaking tokens

- **Google Analytics 4** (`G-LV24FGSHJJ`), added in a privacy-safe way:
  - It loads from `public/js/analytics.js`, a site file, so the Content Security Policy still bans inline code. The policy allows only Google's analytics domains.
  - Page views are sent by the app on each navigation, with route-only addresses (`/tasks/:id`). Query strings in the hash, which can carry one-time verify and reset tokens, are dropped, and record IDs become `:id`.
  - Analytics is off on `localhost`, so development traffic stays out of the reports.
- **Tokens leave the address bar as soon as they're read** on the verify-email and reset-password pages. Browser history, screenshots and analytics' automatic events never see them.
- Verified in the browser: Google received only `/reset-password` and `/login` page views, the test token appeared in no request, and there were no CSP errors.

## 2026-10-27 — Login form centred on the live site

- **Off-centre login form:** on wide screens the login page uses two columns, the form and the one-click demo-accounts panel. With demo mode off, as on the live site, that panel doesn't exist, so the form sat alone in the right-hand column. It now uses two columns only when the demo panel is shown; otherwise it's centred like the other sign-in pages.

## 2026-10-27 — Updates show up immediately

- **Stale pages after a deploy:**
  - Static files were sent with `Cache-Control: max-age=3600`, so browsers that had visited in the last hour kept showing the old site. The new theme button was missing on the live site until a hard refresh.
  - Worse, a browser could mix cached and new ES modules and fail to load the page.
  - Files are now sent with `max-age=0` and an ETag. Browsers check for a newer version on every load, and an unchanged file costs a tiny 304 reply.
  - Test: `test/app.regression-2.test.js`.

## 2026-10-27 — Light mode, more skills, sign-up fixes

- **Light mode:**
  - Every color in the stylesheets is now a token in `public/css/tokens.css`. A `:root[data-theme="light"]` block re-tunes those tokens, so the dark design is unchanged.
  - Every text color meets WCAG AA (4.5:1) on all light surfaces. The orange accent and the status colors are deeper in light mode for that reason.
  - `public/js/theme.js` runs in `<head>` before the first paint, so there's no flash of the wrong theme. It follows the device setting by default and remembers a manual choice per browser.
  - There's a sun/moon button in both headers, and Settings → **المظهر** has تلقائي / فاتح / داكن. The two stay in sync.
  - The printable completion summary stays white paper in both themes.
- **More skills:**
  - The 16 popular suggestions stay visible. "مهارات أخرى حسب المجال" opens 65 skills grouped into 8 fields (design, video, marketing, writing, web, data, business, 3D).
  - Skills already added are hidden from the suggestions.
  - Tools keep their English names and general skills are in Arabic, one spelling each, so matching stays exact.
- **Sign-up page:**
  - **Error focus:** with errors, the form now focuses the first invalid field *on the page*. It used to jump past the company-name field to the one below it. The fix is in the shared `showErrors`, so every form benefits, including errors returned by the server.
  - **Account type:** the selected type now has an orange outline and a check mark, instead of only a faint pressed look.
  - **Name error:** now says what to write ("اكتب اسمك الكامل." / "اكتب اسم الشخص المسؤول.").
  - **Phone header:** the public header no longer wraps onto two rows on phones (73px instead of 105–165px). The button for the page you're on is hidden, phones keep a single auth button, and the landing page moves them into its menu.

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
