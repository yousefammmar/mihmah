# مهمّة | Mihmah — interactive frontend prototype

**خبرتك تبدأ بمهمّة.** Mihmah connects Jordanian university students with small businesses that need short, paid digital projects. This repository is a static, Arabic-first (RTL) prototype of the full workflow:

company posts a task → student applies → company selects → project starts → student submits → company requests revisions or approves → portfolio updates.

Plain HTML, CSS and vanilla JavaScript (ES modules). No frameworks, no dependencies, no build step.

## Run locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```bash
python3 serve.py
```

Then open http://localhost:8000. You can pass a port, e.g. `python3 serve.py 5173`.

`serve.py` is Python's standard-library static server with a larger connection backlog and `Cache-Control: no-cache`. Plain `python3 -m http.server` also works, but on a cold load it sometimes resets one of the ~20 module requests (backlog of 5). If the page stays blank, reload.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, choose "Deploy from a branch", select the branch and `/ (root)`.
3. The site works under a sub-path (`https://<user>.github.io/<repo>/`) because every asset path is relative and routing uses the URL hash (`#/tasks`, `#/projects/…`). Refreshing any page works.

## Demo walkthrough

All data is fictional and marked «تجريبي». It is stored in your browser only.

**Company → student → company**
1. On the landing page choose **انشر مهمّة**, then **الدخول كشركة تجريبية** (مقهى السنديان).
2. Complete the four-step form (basics → scope, deliverables, skills → budget, deadline, milestones → preview) and publish. Try leaving fields empty, or picking a deadline shorter than the duration, to see the validation.
3. On the empty applicants page choose **التبديل إلى الطالب وفتح المهمة**. You are now ليان منصور.
4. Submit a proposal (50+ characters), a portfolio link and a delivery time. Applying twice is blocked.
5. Use **التبديل إلى وضع الشركة** in the sidebar. The dashboard counts and the bell update. Open the task, choose **اختيار هذا الطالب** and confirm. A shared project is created.

**Project workspace (switch roles with the buttons inside the workspace)**
1. Student: tick milestones, send a message, then **تسليم العمل للمراجعة** with links and optional image/PDF files (previewed locally).
2. Company: **طلب تعديلات**. Written feedback is required.
3. Student: read the feedback and resubmit (round 2).
4. Company: **اعتماد الإنجاز** with a 1–5 rating and a comment.
5. Student: **ملف الإنجازات** now lists the project with the rating. **ملخص الإنجاز** opens a printable summary, clearly marked as a prototype and not a certificate.

Other things to try: search and combined filters in **استكشف المهام** (category, skills, budget, duration, sort, saved only), creating your own profile via **إنشاء ملف طالب جديد / شركة جديد**, editing your profile, and **الإعدادات → إعادة ضبط البيانات التجريبية** to restore the seed.

## Project structure

```
index.html            Single page shell (lang="ar", dir="rtl")
serve.py              Optional local static server (stdlib only)
assets/favicon.svg
css/
  tokens.css          Colours, radii, shadows, fonts (custom properties)
  base.css            Reset, typography, focus, reduced motion
  components.css      Buttons, forms, badges, dialogs, toasts, lists
  layout.css          App shell (right-side nav), public header/footer, grids
  pages.css           Landing, discovery, wizard, workspace, portfolio, print
js/
  app.js              Route table, guards, rendering, focus management
  router.js           Hash router
  store.js            State, localStorage persistence, workflow actions and role checks
  data.js             Reference lists and demo seed
  files.js            IndexedDB storage for demo attachments
  dom.js              Safe element builder and Arabic formatting helpers
  ui.js               Toasts, dialogs, form validation, shared components
  icons.js            Outline SVG icon set
  shell.js            Signed-in shell and public chrome
  views/              landing, entry (demo/onboarding), student, company, project, portfolio, settings
```

All user text is inserted with `textContent` through `h()` in `dom.js`. The only `innerHTML` is the static icon markup in `icons.js`.

## Prototype limits (by design)

- **No real accounts.** "Demo entry" and role switching are simulated in one browser. Role checks in `store.js` keep the demo consistent, but they are not security.
- **No payments.** Budgets in JOD are display-only. Task discovery, task details, the publish form, the project workspace, the approval dialog, the completion summary, the FAQ and the footer all say no real transaction happens.
- **Local data only.** Records and preferences live in `localStorage`, and attachments in IndexedDB on this device. Messages are visible when switching roles in the same browser but are not real-time and don't reach other devices. Clearing site data or using private mode loses them. The app warns if saving fails.
- **No external verification.** The completion summary is not a certificate. Demo feedback is fictional sample data, and the landing page has no testimonials, partner logos or statistics.

## Design source

The brief asked to use a Stitch project. The connected Stitch account has seven projects (MLVERSE, JSVERSE, JavaZero ×2, AWS Course Catalog, PlayMap ×2) and none is for Mihmah. No reference images came through with the request either. The visual design is therefore built from the brief's written direction and fallback tokens: dark charcoal surfaces (#191B1E / #24272B / #2D3035), restrained neo-skeuomorphic raised cards and inset controls, warm orange accent #F28C54, outline icons, and the Tajawal font with IBM Plex Sans Arabic and system fallbacks.

UX research notes are in [RESEARCH.md](RESEARCH.md).
