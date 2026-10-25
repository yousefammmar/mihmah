// Page chrome: the signed-in app shell (right-side navigation) and the public header/footer.
import { h } from './dom.js';
import { icon } from './icons.js';
import { avatar, toast, reportError, select } from './ui.js';
import { navigate } from './router.js';
import { api, session, applySession } from './api.js';

const NAV = {
  student: [
    ['/student', 'لوحة التحكم', 'grid'],
    ['/tasks', 'استكشف المهام', 'search'],
    ['/applications', 'طلباتي وعروضي', 'file'],
    ['/projects', 'مشاريعي', 'folder'],
    ['/portfolio', 'ملف الإنجازات', 'award'],
    ['/notifications', 'الإشعارات', 'bell'],
    ['/settings', 'الإعدادات', 'sliders'],
  ],
  company: [
    ['/company', 'لوحة التحكم', 'grid'],
    ['/company/tasks', 'مهامي', 'briefcase'],
    ['/company/publish', 'انشر مهمّة', 'plus'],
    ['/projects', 'المشاريع', 'folder'],
    ['/notifications', 'الإشعارات', 'bell'],
    ['/settings', 'الإعدادات', 'sliders'],
  ],
  admin: [
    ['/admin', 'نظرة عامة', 'grid'],
    ['/admin/companies', 'توثيق الشركات', 'building'],
    ['/admin/reports', 'البلاغات', 'alert'],
    ['/admin/tasks', 'إدارة المهام', 'briefcase'],
    ['/admin/users', 'المستخدمون', 'users'],
    ['/admin/projects', 'المشاريع والنزاعات', 'folder'],
    ['/admin/payments', 'المدفوعات', 'wallet'],
    ['/admin/audit', 'سجل التدقيق', 'history'],
    ['/notifications', 'الإشعارات', 'bell'],
    ['/settings', 'الإعدادات', 'sliders'],
  ],
};

export const ROLE_LABEL = { student: 'طالب', company: 'شركة', admin: 'مسؤول المنصة' };
export const HOME = { student: '/student', company: '/company', admin: '/admin' };

export function brand(href = '#/') {
  return h('a', { class: 'brand', href, 'aria-label': 'مهمّة — الصفحة الرئيسية' },
    h('span', { class: 'brand-mark' }, icon('logo')),
    h('span', { class: 'brand-name' }, 'مهمّة'));
}

function isActive(itemPath, path) {
  if (['/company', '/student', '/admin'].includes(itemPath)) return path === itemPath;
  if (itemPath === '/company/tasks') return path === itemPath || (path.startsWith('/company/tasks/'));
  return path === itemPath || path.startsWith(`${itemPath}/`);
}

function skipLink() {
  return h('a', {
    class: 'skip-link', href: '#main',
    onclick: (e) => { e.preventDefault(); document.getElementById('main')?.focus(); },
  }, 'تخطَّ إلى المحتوى');
}

export async function logout() {
  try { await api.post('/auth/logout'); } catch { /* the session is cleared locally either way */ }
  applySession({ user: null, csrf: null });
  navigate('/');
}

// Updates the unread badge in the bell and the nav without re-rendering the page.
export async function refreshUnread() {
  if (!session.user) return;
  try {
    const { unread } = await api.get('/notifications', { pageSize: 1 });
    document.querySelectorAll('[data-unread]').forEach((el) => {
      el.textContent = String(unread);
      el.hidden = unread === 0;
    });
    const bell = document.querySelector('.bell');
    bell?.setAttribute('aria-label', unread ? `الإشعارات، ${unread} غير مقروءة` : 'الإشعارات');
  } catch { /* badge stays as is */ }
}

// Demo environments only: sign into another fictional demo account.
function demoSwitcher() {
  if (!session.demoMode || !session.user?.isDemo) return null;
  const sel = select({ id: 'demo-switch', 'aria-label': 'التبديل إلى حساب تجريبي آخر' },
    [['student', 'طالب تجريبي'], ['company', 'شركة تجريبية'], ['admin', 'مسؤول تجريبي']].filter(([k]) => k !== session.user.role), 'تبديل الحساب التجريبي…');
  sel.addEventListener('change', async () => {
    if (!sel.value) return;
    try {
      const data = await api.post('/demo/login', { account: sel.value });
      applySession({ ...data, payments: session.payments });
      toast('سجّلت الدخول بحساب تجريبي آخر.', 'info');
      navigate(HOME[data.user.role]);
    } catch (err) { reportError(err); }
  });
  return h('div', { class: 'demo-switch' }, h('p', { class: 'field-hint' }, 'بيئة تجريبية: بيانات خيالية'), sel);
}

export function appShell(path, content) {
  const user = session.user;
  const r = user.role;
  const shell = h('div', { class: 'shell' });
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'التنقل الرئيسي' },
    h('div', { class: 'sidebar-top' }, brand(`#${HOME[r]}`),
      h('button', { type: 'button', class: 'icon-btn sidebar-close', 'aria-label': 'إغلاق القائمة', onclick: () => setOpen(false) }, icon('x'))),
    h('nav', null, h('ul', { class: 'nav-list' },
      NAV[r].map(([p, label, ico]) => h('li', null,
        h('a', { href: `#${p}`, class: 'nav-link', 'aria-current': isActive(p, path) ? 'page' : null },
          icon(ico), h('span', null, label),
          p === '/notifications' && h('span', { class: 'nav-count', 'data-unread': true, hidden: true, 'aria-hidden': 'true' }, '0')))))),
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'user-card' }, avatar(user.name),
        h('div', { class: 'user-meta' },
          h('span', { class: 'user-name' }, user.name),
          h('span', { class: 'user-role' }, ROLE_LABEL[r], user.isDemo ? ' · تجريبي' : ''))),
      demoSwitcher(),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: logout }, icon('logout'), 'تسجيل الخروج')));

  const menuBtn = h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-label': 'فتح القائمة', 'aria-controls': 'sidebar', 'aria-expanded': 'false', onclick: () => setOpen(true) }, icon('menu'));
  const topbar = h('header', { class: 'topbar' },
    menuBtn,
    h('div', { class: 'topbar-brand' }, brand(`#${HOME[r]}`)),
    session.demoMode
      ? h('p', { class: 'demo-pill' }, icon('shield'), h('span', null, h('strong', null, 'بيئة تجريبية'), h('span', { class: 'demo-pill-extra' }, ' · بيانات خيالية منفصلة عن الحسابات الحقيقية')))
      : h('p', { class: 'demo-pill' }, icon('user'), h('span', null, ROLE_LABEL[r], h('span', { class: 'demo-pill-extra' }, ` · ${user.email}`))),
    h('a', { href: '#/notifications', class: 'icon-btn bell', 'aria-label': 'الإشعارات' },
      icon('bell'), h('span', { class: 'bell-dot', 'data-unread': true, hidden: true, 'aria-hidden': 'true' }, '0')));
  const scrim = h('div', { class: 'scrim', onclick: () => setOpen(false) });
  const banner = !user.emailVerified && h('div', { class: 'verify-banner', role: 'note' },
    icon('info'), h('span', null, 'أكّد بريدك الإلكتروني لتتمكن من التقديم على المهام أو نشرها وإرسال العروض.'),
    h('button', {
      type: 'button', class: 'btn btn-text btn-sm', onclick: async (e) => {
        try {
          await api.post('/auth/resend-verification');
          toast('أرسلنا رابط تأكيد جديداً إلى بريدك.', 'info');
          e.currentTarget.disabled = true;
        } catch (err) { reportError(err); }
      },
    }, 'إعادة إرسال الرابط'));
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' }, banner, content);
  const body = h('div', { class: 'shell-body' }, topbar, main);

  function setOpen(open) {
    shell.toggleAttribute('data-nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    body.inert = open;
    if (open) sidebar.querySelector('.nav-link')?.focus();
    else menuBtn.focus();
  }
  sidebar.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shell.hasAttribute('data-nav-open')) setOpen(false); });

  shell.append(skipLink(), sidebar, scrim, body);
  return shell;
}

export function publicShell(content, { landing = false } = {}) {
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target?.querySelector('h2')?.focus({ preventScroll: true });
    header.removeAttribute('data-open');
  };
  const links = [['how', 'كيف تعمل'], ['services', 'الخدمات'], ['benefits', 'المزايا'], ['faq', 'الأسئلة الشائعة']];
  const navList = landing && h('ul', { class: 'pub-links' },
    links.map(([id, label]) => h('li', null, h('a', { href: `#${id}`, onclick: scrollTo(id) }, label))));
  const user = session.user;
  const header = h('header', { class: 'pub-header' },
    h('div', { class: 'container pub-bar' },
      brand(),
      landing && h('button', {
        type: 'button', class: 'icon-btn pub-menu', 'aria-label': 'القائمة', 'aria-expanded': 'false',
        onclick: (e) => { const open = !header.hasAttribute('data-open'); header.toggleAttribute('data-open', open); e.currentTarget.setAttribute('aria-expanded', String(open)); },
      }, icon('menu')),
      h('nav', { class: 'pub-nav', 'aria-label': 'روابط الصفحة' }, navList,
        user
          ? h('a', { class: 'btn btn-primary btn-sm', href: `#${HOME[user.role]}` }, 'لوحة التحكم')
          : [h('a', { class: 'btn btn-text btn-sm', href: '#/login' }, 'تسجيل الدخول'), h('a', { class: 'btn btn-secondary btn-sm', href: '#/register' }, 'إنشاء حساب')])));
  return h('div', { class: 'pub' }, skipLink(), header,
    h('main', { id: 'main', class: 'pub-main', tabindex: '-1' }, content),
    footer());
}

function footer() {
  return h('footer', { class: 'pub-footer' },
    h('div', { class: 'container footer-grid' },
      h('div', null, brand(), h('p', { class: 'footer-tag' }, 'خبرتك تبدأ بمهمّة'),
        h('p', { class: 'footer-small' }, 'منصة أردنية تربط طلاب الجامعات بالمشاريع الصغيرة عبر مهام رقمية قصيرة ومدفوعة.')),
      h('nav', { 'aria-label': 'روابط التذييل' }, h('ul', { class: 'footer-links' },
        h('li', null, h('a', { href: '#/register?role=student' }, 'سجّل كطالب')),
        h('li', null, h('a', { href: '#/register?role=company' }, 'سجّل كشركة')),
        h('li', null, h('a', { href: '#/login' }, 'تسجيل الدخول')))),
      h('p', { class: 'footer-note' }, icon('shield'),
        h('span', null, 'المدفوعات الإلكترونية غير مفعّلة بعد: تُعرض ميزانيات المهام وتُسجَّل، ولا تُنقل أي أموال عبر المنصة حتى ربط مزوّد دفع يدعم الأردن.'))),
    h('p', { class: 'container footer-copy' }, `© ${new Date().getFullYear()} مهمّة · Mihmah`));
}
