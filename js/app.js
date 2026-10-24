// Entry point: route table, guards and rendering.
import { h } from './dom.js';
import { route, parse, match, navigate } from './router.js';
import { appShell, publicShell, switchTo, ROLE_LABEL } from './shell.js';
import { emptyState, toast } from './ui.js';
import * as store from './store.js';
import { landing } from './views/landing.js';
import { start, onboarding } from './views/entry.js';
import { studentDashboard, discovery, taskDetail, applications } from './views/student.js';
import { companyDashboard, companyTasks, publishWizard, applicants } from './views/company.js';
import { projectsList, workspace, summary } from './views/project.js';
import { portfolio } from './views/portfolio.js';
import { settings, notifications } from './views/settings.js';

route('/', { view: landing, public: true });
route('/start', { view: start, public: true });
route('/onboarding/:role', { view: onboarding, public: true });
route('/student', { view: studentDashboard, role: 'student' });
route('/tasks', { view: discovery, role: 'student' });
route('/tasks/:id', { view: taskDetail, role: 'student' });
route('/applications', { view: applications, role: 'student' });
route('/portfolio', { view: portfolio, role: 'student' });
route('/portfolio/:id', { view: portfolio, role: 'any' });
route('/projects', { view: projectsList, role: 'any' });
route('/projects/:id', { view: workspace, role: 'any' });
route('/summary/:id', { view: summary, role: 'any' });
route('/company', { view: companyDashboard, role: 'company' });
route('/company/tasks', { view: companyTasks, role: 'company' });
route('/company/tasks/:id', { view: applicants, role: 'company' });
route('/company/publish', { view: publishWizard, role: 'company' });
route('/notifications', { view: notifications, role: 'any' });
route('/settings', { view: settings, role: 'any' });

const app = document.getElementById('app');
let lastPath = null;
let lastHash = null;

function wrongRole(needed, path) {
  return h('div', { class: 'page' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'صفحة لوضع آخر'),
    emptyState({
      ico: 'switch',
      title: `هذه الصفحة متاحة في وضع «${ROLE_LABEL[needed]}»`,
      text: 'بدّل الوضع التجريبي لعرضها. التبديل محاكاة داخل المتصفح وليس صلاحيات حقيقية.',
      action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => switchTo(needed, path) }, 'التبديل الآن'),
    }));
}

function notFound() {
  return h('div', { class: 'page container' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'الصفحة غير موجودة'),
    emptyState({
      ico: 'alert', title: 'لم نجد هذه الصفحة',
      text: 'ربما حُذف السجل بعد إعادة ضبط البيانات التجريبية.',
      action: h('a', { class: 'btn btn-primary', href: '#/' }, 'العودة إلى الرئيسية'),
    }));
}

function render() {
  const { path, query } = parse();
  const m = match(path);
  const r = store.role();

  if (m && !m.public && !r) {
    navigate(`/start?next=${encodeURIComponent(path)}`);
    return;
  }

  let view;
  try {
    if (!m) view = notFound();
    else if (m.role !== 'any' && !m.public && m.role !== r) view = wrongRole(m.role, path);
    else view = m.view({ params: m.params, query }) || notFound();
  } catch (err) {
    console.error(err);
    view = notFound();
  }

  const isNew = path !== lastPath;
  const focusId = !isNew && document.activeElement?.id;
  const hadFocus = app.contains(document.activeElement);
  const scrollY = window.scrollY;
  const useApp = r && (!m || !m.public);
  app.replaceChildren(useApp ? appShell(path, view) : publicShell(view, { landing: path === '/' }));

  const title = app.querySelector('[data-page-title]');
  document.title = title && path !== '/' ? `${title.textContent} | مهمّة` : 'مهمّة | Mihmah — خبرتك تبدأ بمهمّة';
  if (isNew) {
    window.scrollTo(0, 0);
    if (lastPath !== null) title?.focus({ preventScroll: true });
  } else {
    // Keep focus on the same control; if a re-render removed it, land on <main> instead of <body>.
    const keep = focusId && document.getElementById(focusId);
    if (keep) keep.focus({ preventScroll: true });
    else if (hadFocus) document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
  }
  lastPath = path;
  lastHash = location.hash;
}

let warned = false;
store.subscribe(() => {
  if (store.storageFailed() && !warned) {
    warned = true;
    toast('تعذّر الحفظ في المتصفح (قد تكون مساحة التخزين ممتلئة أو في وضع التصفح الخاص). ستُفقد التغييرات عند إعادة التحميل.', 'error');
  }
  render();
});
window.addEventListener('hashchange', () => { if (location.hash !== lastHash) render(); });
window.addEventListener('rerender', render);
render();
