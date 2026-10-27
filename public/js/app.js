// Entry point: route table, session guards, async rendering with loading/error states, focus management.
import { h } from './dom.js';
import { route, parse, match, navigate, setRenderer } from './router.js';
import { appShell, publicShell, HOME, ROLE_LABEL, refreshUnread } from './shell.js';
import { emptyState, errorState, loadingState, toast } from './ui.js';
import { session, loadSession, onSessionChange } from './api.js';
import { connectLive, disconnectLive, clearScopedLive, onLive } from './live.js';
import { landing } from './views/landing.js';
import { login, register, verifyEmail, forgotPassword, resetPassword } from './views/auth.js';
import { studentDashboard, discovery, taskDetail, applications } from './views/student.js';
import { companyDashboard, companyTasks, publishWizard, applicants } from './views/company.js';
import { projectsList, workspace, summary } from './views/project.js';
import { portfolio, companyProfile } from './views/portfolio.js';
import { settings, notifications } from './views/settings.js';
import * as admin from './views/admin.js';

route('/', { view: landing, public: true });
route('/login', { view: login, public: true, guestOnly: true });
route('/register', { view: register, public: true, guestOnly: true });
route('/verify-email', { view: verifyEmail, public: true });
route('/forgot-password', { view: forgotPassword, public: true, guestOnly: true });
route('/reset-password', { view: resetPassword, public: true });
route('/student', { view: studentDashboard, role: 'student' });
route('/tasks', { view: discovery, role: 'student' });
route('/tasks/:id', { view: taskDetail, role: 'any' });
route('/applications', { view: applications, role: 'student' });
route('/portfolio', { view: portfolio, role: 'student' });
route('/students/:id', { view: portfolio, role: 'any' });
route('/companies/:id', { view: companyProfile, role: 'any' });
route('/projects', { view: projectsList, role: 'any' });
route('/projects/:id', { view: workspace, role: 'any' });
route('/summary/:id', { view: summary, role: 'any' });
route('/company', { view: companyDashboard, role: 'company' });
route('/company/tasks', { view: companyTasks, role: 'company' });
route('/company/tasks/:id', { view: applicants, role: 'company' });
route('/company/tasks/:id/edit', { view: publishWizard, role: 'company' });
route('/company/publish', { view: publishWizard, role: 'company' });
route('/notifications', { view: notifications, role: 'any' });
route('/settings', { view: settings, role: 'any' });
route('/admin', { view: admin.overview, role: 'admin' });
route('/admin/companies', { view: admin.companies, role: 'admin' });
route('/admin/reports', { view: admin.reports, role: 'admin' });
route('/admin/tasks', { view: admin.tasks, role: 'admin' });
route('/admin/users', { view: admin.users, role: 'admin' });
route('/admin/projects', { view: admin.projects, role: 'admin' });
route('/admin/audit', { view: admin.audit, role: 'admin' });
route('/admin/payments', { view: admin.payments, role: 'admin' });

const app = document.getElementById('app');
let lastPath = null;
let lastHash = null;
let seq = 0;

const pageTitle = (text) => h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, text);

function wrongRole(needed) {
  return h('div', { class: 'page' }, pageTitle('صفحة غير متاحة لهذا الحساب'),
    emptyState({
      ico: 'shield',
      title: `هذه الصفحة مخصصة لحسابات «${ROLE_LABEL[needed]}»`,
      text: 'سجّل الدخول بالحساب المناسب لعرضها.',
      action: h('a', { class: 'btn btn-primary', href: `#${HOME[session.user.role]}` }, 'العودة إلى لوحة التحكم'),
    }));
}

function notFound() {
  return h('div', { class: 'page container' }, pageTitle('الصفحة غير موجودة'),
    emptyState({
      ico: 'alert', title: 'لم نجد هذه الصفحة',
      text: 'ربما حُذف العنصر، أو لا تملك صلاحية الوصول إليه.',
      action: h('a', { class: 'btn btn-primary', href: session.user ? `#${HOME[session.user.role]}` : '#/' }, 'العودة'),
    }));
}

function mount(path, m, view) {
  const useApp = session.user && !(m && m.public && path === '/');
  const isAuthPage = m?.public && path !== '/';
  app.replaceChildren(useApp && !isAuthPage ? appShell(path, view) : publicShell(view, { landing: path === '/' }));
  if (useApp && !isAuthPage) refreshUnread();
}

async function render({ soft = false } = {}) {
  const my = ++seq;
  const { path, query } = parse();
  const m = match(path);
  const user = session.user;

  if (m && !m.public && !user) return navigate(`/login?next=${encodeURIComponent(location.hash.slice(1))}`);
  if (m?.guestOnly && user) return navigate(HOME[user.role]);

  const isNew = path !== lastPath;
  const focusId = !isNew && document.activeElement?.id;
  const hadFocus = app.contains(document.activeElement);
  const scrollY = window.scrollY;

  if (isNew && !soft) {
    clearScopedLive();
    mount(path, m, h('div', { class: 'page' }, loadingState()));
  }

  let view;
  try {
    if (!m) view = notFound();
    else if (m.role && m.role !== 'any' && m.role !== user.role) view = wrongRole(m.role);
    else view = (await m.view({ params: m.params, query })) || notFound();
  } catch (err) {
    if (err.status === 404 || err.status === 403) view = notFound();
    else view = h('div', { class: 'page' }, pageTitle('خطأ'), errorState(err, () => render({ soft: true })));
  }
  if (my !== seq) return; // a newer navigation started while this one was loading

  mount(path, m, view);
  const title = app.querySelector('[data-page-title]');
  document.title = title && path !== '/' ? `${title.textContent} | مهمّة` : 'مهمّة | Mihmah — خبرتك تبدأ بمهمّة';
  if (isNew) window.mihmahTrackPage?.(); // analytics.js; soft refreshes are not new page views
  if (isNew) {
    window.scrollTo(0, 0);
    if (lastPath !== null) title?.focus({ preventScroll: true });
  } else {
    const keep = focusId && document.getElementById(focusId);
    if (keep) keep.focus({ preventScroll: true });
    else if (hadFocus) document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
  }
  lastPath = path;
  lastHash = location.hash;
}

setRenderer(() => render({ soft: true }));
window.addEventListener('hashchange', () => { if (location.hash !== lastHash) render(); });
window.addEventListener('rerender', () => render({ soft: true }));

onSessionChange((s) => (s.user ? connectLive() : disconnectLive()));
// Never yank the page out from under someone who is typing or has a dialog open.
const isBusy = () => !!document.querySelector('dialog[open]')
  || [...app.querySelectorAll('main input:not([type=checkbox]):not([type=radio]):not([type=search]), main textarea')].some((el) => el.value.trim() && el.defaultValue !== el.value);

onLive('notification', () => {
  refreshUnread();
  toast('لديك إشعار جديد.', 'info');
  if (session.user && !isBusy()) render({ soft: true });
}, { scoped: false });

try {
  await loadSession();
} catch {
  // Server unreachable: public pages still render; signed-in pages will show the error state.
}
render();
