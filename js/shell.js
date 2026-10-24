// Page chrome: the signed-in app shell (right-side navigation) and the public header/footer.
import { h } from './dom.js';
import { icon } from './icons.js';
import { avatar, toast } from './ui.js';
import { navigate } from './router.js';
import * as store from './store.js';

const NAV = {
  student: [
    ['/student', 'لوحة التحكم', 'grid'],
    ['/tasks', 'استكشف المهام', 'search'],
    ['/applications', 'طلباتي', 'file'],
    ['/projects', 'مشاريعي', 'folder'],
    ['/portfolio', 'ملف الإنجازات', 'award'],
    ['/notifications', 'الإشعارات', 'bell'],
    ['/settings', 'الإعدادات', 'sliders'],
  ],
  company: [
    ['/company', 'لوحة التحكم', 'grid'],
    ['/company/tasks', 'مهامي المنشورة', 'briefcase'],
    ['/company/publish', 'انشر مهمّة', 'plus'],
    ['/projects', 'المشاريع', 'folder'],
    ['/notifications', 'الإشعارات', 'bell'],
    ['/settings', 'الإعدادات', 'sliders'],
  ],
};

export const ROLE_LABEL = { student: 'طالب تجريبي', company: 'شركة تجريبية' };
export const HOME = { student: '/student', company: '/company' };

export function brand(href = '#/') {
  return h('a', { class: 'brand', href, 'aria-label': 'مهمّة — الصفحة الرئيسية' },
    h('span', { class: 'brand-mark' }, icon('logo')),
    h('span', { class: 'brand-name' }, 'مهمّة'));
}

export function switchTo(r, path = HOME[r]) {
  navigate(path);
  store.switchRole(r);
  toast(`أنت الآن في ${r === 'student' ? 'وضع الطالب' : 'وضع الشركة'} (تبديل تجريبي).`, 'info');
}

function isActive(itemPath, path) {
  if (itemPath === '/company' || itemPath === '/student') return path === itemPath;
  if (itemPath === '/company/tasks') return path === itemPath || (path.startsWith('/company/tasks/'));
  return path === itemPath || path.startsWith(`${itemPath}/`);
}

function skipLink() {
  return h('a', {
    class: 'skip-link', href: '#main',
    onclick: (e) => { e.preventDefault(); document.getElementById('main')?.focus(); },
  }, 'تخطَّ إلى المحتوى');
}

export function appShell(path, content) {
  const r = store.role();
  const user = store.currentUser();
  const unread = store.myNotifications().filter((n) => !n.read).length;
  const other = r === 'student' ? 'company' : 'student';

  const shell = h('div', { class: 'shell' });
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'التنقل الرئيسي' },
    h('div', { class: 'sidebar-top' }, brand(`#${HOME[r]}`),
      h('button', { type: 'button', class: 'icon-btn sidebar-close', 'aria-label': 'إغلاق القائمة', onclick: () => setOpen(false) }, icon('x'))),
    h('nav', null, h('ul', { class: 'nav-list' },
      NAV[r].map(([p, label, ico]) => h('li', null,
        h('a', { href: `#${p}`, class: 'nav-link', 'aria-current': isActive(p, path) ? 'page' : null },
          icon(ico), h('span', null, label),
          p === '/notifications' && unread > 0 && h('span', { class: 'nav-count', 'aria-label': `${unread} غير مقروءة` }, String(unread))))))),
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'user-card' }, avatar(user.name),
        h('div', { class: 'user-meta' },
          h('span', { class: 'user-name' }, user.name),
          h('span', { class: 'user-role' }, ROLE_LABEL[r]))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => switchTo(other) },
        icon('switch'), other === 'company' ? 'التبديل إلى وضع الشركة' : 'التبديل إلى وضع الطالب'),
      h('button', { type: 'button', class: 'btn btn-text btn-block', onclick: () => { navigate('/'); store.exitDemo(); } },
        icon('logout'), 'الخروج من التجربة')));

  const menuBtn = h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-label': 'فتح القائمة', 'aria-controls': 'sidebar', 'aria-expanded': 'false', onclick: () => setOpen(true) }, icon('menu'));
  const topbar = h('header', { class: 'topbar' },
    menuBtn,
    h('div', { class: 'topbar-brand' }, brand(`#${HOME[r]}`)),
    h('p', { class: 'demo-pill' }, icon('shield'), h('span', null, 'نموذج أولي · ', h('strong', null, ROLE_LABEL[r]), h('span', { class: 'demo-pill-extra' }, ' · البيانات محفوظة في هذا المتصفح فقط'))),
    h('a', { href: '#/notifications', class: 'icon-btn bell', 'aria-label': unread ? `الإشعارات، ${unread} غير مقروءة` : 'الإشعارات' },
      icon('bell'), unread > 0 && h('span', { class: 'bell-dot', 'aria-hidden': 'true' }, String(unread))));
  const scrim = h('div', { class: 'scrim', onclick: () => setOpen(false) });
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' }, content);
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
    navList?.closest('header')?.removeAttribute('data-open');
  };
  const links = [['how', 'كيف تعمل'], ['services', 'الخدمات'], ['benefits', 'المزايا'], ['faq', 'الأسئلة الشائعة']];
  const navList = landing && h('ul', { class: 'pub-links' },
    links.map(([id, label]) => h('li', null, h('a', { href: `#${id}`, onclick: scrollTo(id) }, label))));
  const r = store.role();
  const header = h('header', { class: 'pub-header' },
    h('div', { class: 'container pub-bar' },
      brand(),
      landing && h('button', {
        type: 'button', class: 'icon-btn pub-menu', 'aria-label': 'القائمة', 'aria-expanded': 'false',
        onclick: (e) => { const open = !header.hasAttribute('data-open'); header.toggleAttribute('data-open', open); e.currentTarget.setAttribute('aria-expanded', String(open)); },
      }, icon('menu')),
      h('nav', { class: 'pub-nav', 'aria-label': 'روابط الصفحة' }, navList,
        r ? h('a', { class: 'btn btn-primary btn-sm', href: `#${HOME[r]}` }, 'لوحة التحكم')
          : h('a', { class: 'btn btn-secondary btn-sm', href: '#/start' }, 'الدخول التجريبي'))));
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
        h('li', null, h('a', { href: '#/start?next=/tasks' }, 'استكشف المهام')),
        h('li', null, h('a', { href: '#/start?next=/company/publish' }, 'انشر مهمّة')),
        h('li', null, h('a', { href: '#/start' }, 'الدخول التجريبي')))),
      h('p', { class: 'footer-note' }, icon('shield'),
        h('span', null, 'هذا نموذج أولي للعرض فقط: الدخول محاكى، ولا توجد حسابات أو مدفوعات أو رسائل حقيقية، وكل البيانات محفوظة في متصفحك.'))),
    h('p', { class: 'container footer-copy' }, `© ${new Date().getFullYear()} مهمّة · Mihmah — نموذج أولي`));
}
