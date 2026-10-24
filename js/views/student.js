import { h, bdi, fmtJOD, fmtDate, fmtDays, fmtRelative, daysUntil, isUrl } from '../dom.js';
import { icon } from '../icons.js';
import { CATEGORIES, APPLICATION_STATUS, PROJECT_STATUS } from '../data.js';
import {
  pageHeader, section, stat, emptyState, badge, statusBadge, demoBadge, skillChips, field, input, textarea,
  select, showErrors, liveClear, busy, toast, reportError, note, extLink,
} from '../ui.js';
import { navigate } from '../router.js';
import * as store from '../store.js';

export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
const skillSet = (skills = []) => new Set(skills.map((s) => s.toLowerCase()));

export function deadlineText(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0) return `انتهى في ${fmtDate(dateStr)}`;
  if (d === 0) return 'التسليم اليوم';
  return `التسليم خلال ${fmtDays(d)}`;
}

// ---------- task card ----------
export function taskCard(t, { compact = false } = {}) {
  const c = store.companyById(t.companyId);
  const cat = categoryOf(t.category);
  const me = store.currentStudent();
  const applied = store.applicationOf(t.id, me.id);
  const saved = store.isSaved(t.id);
  return h('article', { class: 'task-card card-raised', 'aria-labelledby': `tt-${t.id}` },
    h('div', { class: 'task-card-top' },
      badge(cat.label, 'cat', cat.icon),
      h('button', {
        type: 'button', id: `save-${t.id}`, class: `icon-btn save-btn${saved ? ' is-saved' : ''}`,
        'aria-pressed': String(saved), 'aria-label': saved ? `إزالة «${t.title}» من المحفوظة` : `حفظ «${t.title}»`,
        onclick: () => {
          const now = store.toggleSaved(t.id);
          toast(now ? 'حُفظت المهمة في قائمتك.' : 'أُزيلت المهمة من المحفوظة.', 'info');
        },
      }, icon('bookmark'))),
    h('h3', { class: 'task-card-title', id: `tt-${t.id}` }, h('a', { href: `#/tasks/${t.id}` }, t.title)),
    h('p', { class: 'task-card-company' }, icon('building'), h('span', null, c.name), c.demo && demoBadge(), h('span', { class: 'muted' }, ` · ${c.city}`)),
    !compact && h('p', { class: 'task-card-summary' }, t.summary),
    h('ul', { class: 'meta-row', 'aria-label': 'تفاصيل المهمة' },
      h('li', { class: 'inset-pill pill-accent' }, icon('wallet'), bdi(fmtJOD(t.budget))),
      h('li', { class: 'inset-pill' }, icon('clock'), fmtDays(t.durationDays)),
      h('li', { class: 'inset-pill' }, icon('calendar'), deadlineText(t.deadline))),
    !compact && skillChips(t.skills, skillSet(me.skills)),
    h('div', { class: 'task-card-foot' },
      applied ? statusBadge(APPLICATION_STATUS, applied.status) : h('span', { class: 'muted small' }, `نُشرت ${fmtRelative(t.createdAt)}`),
      h('a', { class: 'btn btn-ghost btn-sm', href: `#/tasks/${t.id}`, 'aria-label': `عرض تفاصيل «${t.title}»` }, 'التفاصيل', icon('chevron-left'))));
}

// ---------- dashboard ----------
export function studentDashboard() {
  const me = store.currentStudent();
  const apps = store.studentApplications(me.id);
  const pending = apps.filter((a) => a.status === 'pending');
  const projects = store.studentProjects(me.id);
  const ongoing = projects.filter((p) => p.status !== 'completed');
  const completed = store.completedFor(me.id);
  const mine = skillSet(me.skills);
  const relevant = store.openTasks()
    .filter((t) => !store.applicationOf(t.id, me.id))
    .map((t) => ({ t, score: t.skills.filter((s) => mine.has(s.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score || b.t.createdAt.localeCompare(a.t.createdAt))
    .slice(0, 3).map((x) => x.t);
  const notes = store.myNotifications().slice(0, 5);
  const ratings = completed.map((p) => p.feedback?.rating).filter(Boolean);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'لوحة الطالب', title: `أهلاً، ${me.name.split(' ')[0]}`, subtitle: 'ملخص طلباتك ومشاريعك والمهام المناسبة لمهاراتك.',
      actions: h('a', { class: 'btn btn-primary', href: '#/tasks' }, icon('search'), 'استكشف المهام'),
    }),
    h('div', { class: 'stats' },
      stat('طلبات قيد المراجعة', pending.length, 'file', '/applications'),
      stat('مشاريع جارية', ongoing.length, 'folder', '/projects'),
      stat('مشاريع مكتملة', completed.length, 'award', '/portfolio'),
      stat('مهام محفوظة', store.savedIds().filter((id) => store.taskById(id)?.status === 'open').length, 'bookmark', '/tasks')),
    h('div', { class: 'dash-grid' },
      section('مهام تناسب مهاراتك', relevant.length
        ? h('div', { class: 'card-list' }, relevant.map((t) => taskCard(t, { compact: true })))
        : emptyState({ ico: 'search', title: 'لا توجد مهام جديدة حالياً', text: 'تقدّمت لكل المهام المفتوحة. عُد لاحقاً أو حدّث مهاراتك.' }),
      { ico: 'target', action: h('a', { class: 'link', href: '#/tasks' }, 'كل المهام') }),
      h('div', { class: 'stack' },
        section('مشاريعك الجارية', ongoing.length
          ? h('ul', { class: 'rows' }, ongoing.map(projectRow))
          : emptyState({ ico: 'folder', title: 'لا توجد مشاريع جارية', text: 'عندما تختارك شركة لمهمة، يظهر المشروع هنا.' }),
        { ico: 'folder' }),
        section('طلباتك النشطة', pending.length
          ? h('ul', { class: 'rows' }, pending.map(applicationRow))
          : emptyState({ ico: 'file', title: 'لا توجد طلبات قيد المراجعة', action: h('a', { class: 'btn btn-ghost btn-sm', href: '#/tasks' }, 'تصفّح المهام') }),
        { ico: 'file', action: h('a', { class: 'link', href: '#/applications' }, 'كل الطلبات') })),
      section('الإشعارات', notes.length
        ? h('ul', { class: 'rows' }, notes.map(notificationRow))
        : emptyState({ ico: 'bell', title: 'لا إشعارات بعد', text: 'تظهر هنا تحديثات طلباتك ومشاريعك عند حدوثها.' }),
      { ico: 'bell', action: notes.length ? h('a', { class: 'link', href: '#/notifications' }, 'عرض الكل') : null }),
      section('ملف إنجازاتك', h('div', { class: 'portfolio-mini' },
        h('div', { class: 'mini-stats' },
          h('div', null, h('strong', null, String(completed.length)), h('span', null, 'مشاريع مكتملة')),
          h('div', null, h('strong', null, avg), h('span', null, 'متوسط التقييم')),
          h('div', null, h('strong', null, String(me.skills.length)), h('span', null, 'مهارات'))),
        skillChips(me.skills),
        h('a', { class: 'btn btn-ghost btn-block', href: '#/portfolio' }, icon('award'), 'عرض ملف الإنجازات')),
      { ico: 'award' })));
}

export function projectRow(p) {
  const t = store.taskById(p.taskId);
  const other = store.role() === 'student' ? store.companyById(p.companyId).name : store.studentById(p.studentId).name;
  return h('li', null, h('a', { class: 'row-link', href: `#/projects/${p.id}` },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t.title), h('span', { class: 'row-sub' }, other)),
    statusBadge(PROJECT_STATUS, p.status)));
}

function applicationRow(a) {
  const t = store.taskById(a.taskId);
  return h('li', null, h('a', { class: 'row-link', href: `#/tasks/${t.id}` },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t.title),
      h('span', { class: 'row-sub' }, `${store.companyById(t.companyId).name} · ${fmtRelative(a.createdAt)}`)),
    statusBadge(APPLICATION_STATUS, a.status)));
}

export function notificationRow(n) {
  return h('li', { class: n.read ? '' : 'is-unread' }, h('a', { class: 'row-link', href: `#${n.link}`, onclick: () => store.markNotificationRead(n.id) },
    h('span', { class: 'row-icon' }, icon('bell')),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, n.text), h('span', { class: 'row-sub' }, fmtRelative(n.at))),
    !n.read && h('span', { class: 'dot', 'aria-label': 'غير مقروء' })));
}

// ---------- discovery ----------
const FILTER_KEY = 'mihmah:filters';
const DEFAULT_FILTERS = { q: '', category: '', skills: [], budget: '', duration: '', sort: 'newest', savedOnly: false };
const filters = loadFilters();
let filtersOpen = null; // remembers the collapsed/expanded state across re-renders in this tab

function loadFilters() {
  try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(FILTER_KEY)) }; } catch { return { ...DEFAULT_FILTERS }; }
}
export function resetFilters() {
  Object.assign(filters, structuredClone(DEFAULT_FILTERS));
  saveFilters();
}
function saveFilters() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* preference only */ }
}

// Arabic-aware normalisation so "مهمه" matches "مهمّة" and "اربد" matches "إربد".
const norm = (s) => String(s).toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

const BUDGETS = [['', 'كل الميزانيات'], ['lt75', 'أقل من 75 د.أ'], ['75-120', 'من 75 إلى 120 د.أ'], ['gt120', 'أكثر من 120 د.أ']];
const DURATIONS = [['', 'كل المدد'], ['week', 'أسبوع أو أقل'], ['two', 'من 8 إلى 14 يوماً'], ['long', 'أكثر من أسبوعين']];
const SORTS = [['newest', 'الأحدث'], ['budget-desc', 'الميزانية: الأعلى أولاً'], ['budget-asc', 'الميزانية: الأقل أولاً'], ['deadline', 'أقرب موعد تسليم']];

export function filterTasks(tasks, f, saved = []) {
  const q = norm(f.q.trim());
  const wanted = new Set(f.skills.map((s) => s.toLowerCase()));
  const list = tasks.filter((t) => {
    const company = store.companyById(t.companyId);
    if (q && !norm([t.title, t.summary, company.name, company.city, ...t.skills].join(' ')).includes(q)) return false;
    if (f.category && t.category !== f.category) return false;
    if (wanted.size && !t.skills.some((s) => wanted.has(s.toLowerCase()))) return false;
    if (f.budget === 'lt75' && !(t.budget < 75)) return false;
    if (f.budget === '75-120' && !(t.budget >= 75 && t.budget <= 120)) return false;
    if (f.budget === 'gt120' && !(t.budget > 120)) return false;
    if (f.duration === 'week' && !(t.durationDays <= 7)) return false;
    if (f.duration === 'two' && !(t.durationDays >= 8 && t.durationDays <= 14)) return false;
    if (f.duration === 'long' && !(t.durationDays > 14)) return false;
    if (f.savedOnly && !saved.includes(t.id)) return false;
    return true;
  });
  const sorters = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    'budget-desc': (a, b) => b.budget - a.budget,
    'budget-asc': (a, b) => a.budget - b.budget,
    deadline: (a, b) => a.deadline.localeCompare(b.deadline),
  };
  return list.sort(sorters[f.sort] || sorters.newest);
}

export function discovery() {
  const all = store.openTasks();
  const allSkills = [...new Set(all.flatMap((t) => t.skills))].sort((a, b) => a.localeCompare(b));
  filters.skills = filters.skills.filter((s) => allSkills.includes(s));

  const count = h('p', { class: 'result-count', role: 'status' });
  const results = h('div', { class: 'task-grid' });
  const resetBtn = h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: reset }, icon('refresh'), 'إعادة ضبط الفلاتر');

  const onChange = (key) => (e) => { filters[key] = e.target.value; update(); };
  const search = h('div', { class: 'search-box' }, icon('search'),
    h('input', { id: 'f-q', class: 'input', type: 'search', value: filters.q, placeholder: 'ابحث بالعنوان أو الشركة أو المهارة', 'aria-label': 'بحث في المهام', oninput: onChange('q') }));
  const controls = h('div', { class: 'filter-row' },
    labeled('الفئة', select({ id: 'f-cat', value: filters.category, onchange: onChange('category') }, CATEGORIES.map((c) => [c.id, c.label]), 'كل الفئات')),
    labeled('الميزانية', select({ id: 'f-budget', value: filters.budget, onchange: onChange('budget') }, BUDGETS)),
    labeled('المدة', select({ id: 'f-dur', value: filters.duration, onchange: onChange('duration') }, DURATIONS)),
    labeled('الترتيب', select({ id: 'f-sort', value: filters.sort, onchange: onChange('sort') }, SORTS)));
  const savedToggle = h('button', {
    type: 'button', id: 'f-saved', class: 'toggle-btn', 'aria-pressed': String(filters.savedOnly),
    onclick: (e) => { filters.savedOnly = !filters.savedOnly; e.currentTarget.setAttribute('aria-pressed', String(filters.savedOnly)); update(); },
  }, icon('bookmark'), 'المحفوظة فقط');
  const skillBtns = h('div', { class: 'skill-filter', role: 'group', 'aria-labelledby': 'skills-label' },
    h('span', { id: 'skills-label', class: 'filter-label' }, 'المهارات:'),
    allSkills.map((s) => h('button', {
      type: 'button', class: 'chip chip-btn', id: `f-skill-${s.replace(/\W+/g, '-')}`, 'aria-pressed': String(filters.skills.includes(s)),
      onclick: (e) => {
        const on = !filters.skills.includes(s);
        filters.skills = on ? [...filters.skills, s] : filters.skills.filter((x) => x !== s);
        e.currentTarget.setAttribute('aria-pressed', String(on));
        update();
      },
    }, bdi(s))));

  function reset() {
    resetFilters();
    navigate('/tasks');
    document.getElementById('f-q')?.focus();
  }

  const activeCount = () => [filters.category, filters.budget, filters.duration].filter(Boolean).length + filters.skills.length + (filters.savedOnly ? 1 : 0);
  const activeBadge = h('span', { class: 'filter-active' });
  const more = h('details', {
    class: 'filter-more',
    open: filtersOpen ?? (matchMedia('(min-width: 900px)').matches || activeCount() > 0),
    ontoggle: (e) => { filtersOpen = e.currentTarget.open; },
  },
  h('summary', { class: 'filter-toggle' }, icon('filter'), h('span', null, 'الفلاتر والترتيب'), activeBadge, icon('chevron-left', 'faq-chev')),
  h('div', { class: 'filter-body' }, controls,
    h('div', { class: 'filter-foot' }, skillBtns, h('div', { class: 'filter-actions' }, savedToggle, resetBtn))));

  function update() {
    saveFilters();
    const n = activeCount();
    activeBadge.textContent = n ? `${n} مفعّلة` : '';
    const list = filterTasks(all, filters, store.savedIds());
    count.textContent = list.length ? `عرض ${list.length} من أصل ${all.length}` : 'لا توجد نتائج مطابقة';
    results.replaceChildren(...(list.length ? list.map((t) => taskCard(t)) : [emptyState({
      ico: 'search', title: 'لا توجد مهام تطابق اختيارك',
      text: filters.savedOnly && !store.savedIds().length ? 'لم تحفظ أي مهمة بعد. استخدم زر الحفظ على بطاقة المهمة.' : 'جرّب كلمات بحث أخرى أو خفّف الفلاتر.',
      action: h('button', { type: 'button', class: 'btn btn-primary', onclick: reset }, icon('refresh'), 'إعادة ضبط الفلاتر'),
    })]));
  }
  update();

  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'استكشف', title: 'المهام المتاحة', subtitle: 'مهام قصيرة بميزانيات ثابتة بالدينار الأردني. المبالغ توضيحية ولا تتم أي معاملة مالية، والسجلات الموسومة «تجريبي» بيانات عرض.' }),
    h('section', { class: 'filters panel', 'aria-label': 'البحث والفلاتر' }, search, more),
    count, results);
}

function labeled(label, control) {
  return h('label', { class: 'filter-field' }, h('span', { class: 'filter-label' }, label), control);
}

// ---------- task detail ----------
export function taskDetail({ params }) {
  const t = store.taskById(params.id);
  if (!t) return null;
  const c = store.companyById(t.companyId);
  const cat = categoryOf(t.category);
  const me = store.currentStudent();
  const mine = skillSet(me.skills);
  const app = store.applicationOf(t.id, me.id);
  const applicantCount = store.applicationsForTask(t.id).length;

  return h('div', { class: 'page' },
    h('a', { class: 'back-link', href: '#/tasks' }, icon('chevron-right'), 'العودة إلى المهام'),
    pageHeader({
      eyebrow: cat.label, title: t.title,
      subtitle: h('span', { class: 'inline-meta' }, icon('building'), c.name, c.demo && demoBadge()),
      actions: [
        h('button', {
          type: 'button', id: `save-${t.id}`, class: 'btn btn-ghost', 'aria-pressed': String(store.isSaved(t.id)),
          onclick: () => toast(store.toggleSaved(t.id) ? 'حُفظت المهمة.' : 'أُزيلت من المحفوظة.', 'info'),
        }, icon('bookmark'), store.isSaved(t.id) ? 'محفوظة' : 'حفظ'),
        t.status === 'open' && !app && h('a', { class: 'btn btn-primary', href: '#apply', onclick: (e) => { e.preventDefault(); document.getElementById('apply-proposal')?.focus(); } }, 'قدّم الآن'),
      ],
    }),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'stack' },
        section('نبذة', h('p', { class: 'prose' }, t.summary), { ico: 'info' }),
        section('نطاق العمل', h('p', { class: 'prose' }, t.scope), { ico: 'target' }),
        section('المخرجات المطلوبة', h('ul', { class: 'check-list' }, t.deliverables.map((d) => h('li', null, icon('check'), h('span', null, d)))), { ico: 'file' }),
        section('المهارات المطلوبة', [skillChips(t.skills, mine),
          h('p', { class: 'field-hint' }, `تطابق ${t.skills.filter((s) => mine.has(s.toLowerCase())).length} من ${t.skills.length} مع مهارات ملفك.`)], { ico: 'code' }),
        section('المراحل', h('ol', { class: 'milestone-list' }, t.milestones.map((m, i) => h('li', null, h('span', { class: 'ms-num' }, String(i + 1)), h('span', null, m)))), { ico: 'milestones' }),
        applyBlock(t, app, me)),
      h('aside', { class: 'stack', 'aria-label': 'ملخص المهمة' },
        h('div', { class: 'panel budget-card' },
          h('p', { class: 'budget-label' }, 'الميزانية الثابتة'),
          h('p', { class: 'budget-value' }, bdi(fmtJOD(t.budget))),
          note('مبلغ توضيحي: لا تتم أي معاملة مالية حقيقية في هذا النموذج الأولي.', 'shield')),
        h('dl', { class: 'panel facts' },
          fact('clock', 'مدة التنفيذ', fmtDays(t.durationDays)),
          fact('calendar', 'موعد التسليم', `${fmtDate(t.deadline)} (${deadlineText(t.deadline)})`),
          fact('users', 'عدد المتقدّمين', String(applicantCount)),
          fact('history', 'تاريخ النشر', fmtDate(t.createdAt))),
        h('section', { class: 'panel', 'aria-labelledby': 'co-title' },
          h('h2', { class: 'panel-title', id: 'co-title' }, icon('building'), 'عن الشركة'),
          h('p', { class: 'company-name' }, c.name, ' ', c.demo && demoBadge()),
          h('p', { class: 'muted small' }, `${c.industry} · ${c.city}`),
          h('p', { class: 'prose' }, c.bio)))));
}

function fact(ico, label, value) {
  return h('div', { class: 'fact' }, h('dt', null, icon(ico), label), h('dd', null, value));
}

function applyBlock(t, app, me) {
  if (app) {
    const project = store.projectForTask(t.id);
    return section('طلبك', h('div', { class: 'stack-sm' },
      h('p', null, statusBadge(APPLICATION_STATUS, app.status), ' ', h('span', { class: 'muted small' }, `أُرسل ${fmtRelative(app.createdAt)}`)),
      note('لقد تقدّمت لهذه المهمة. لا يمكن إرسال أكثر من طلب للمهمة نفسها.', 'info'),
      h('p', { class: 'prose quote' }, app.proposal),
      h('p', { class: 'small muted' }, `مدة التسليم المتوقعة: ${fmtDays(app.deliveryDays)}`),
      app.portfolioUrl && extLink(app.portfolioUrl),
      app.status === 'accepted' && project && h('a', { class: 'btn btn-primary', href: `#/projects/${project.id}` }, icon('folder'), 'فتح مساحة المشروع')),
    { ico: 'file', id: 'apply' });
  }
  if (t.status !== 'open') {
    return section('التقديم', note('هذه المهمة لم تعد تستقبل طلبات لأن الشركة اختارت طالباً.', 'info'), { ico: 'file', id: 'apply' });
  }

  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, icon('send'), 'إرسال الطلب');
  const form = h('form', { class: 'stack', novalidate: true },
    field('عرضك المختصر', textarea({ name: 'proposal', id: 'apply-proposal', rows: 5, maxlength: 1000, placeholder: 'كيف ستنفّذ المهمة؟ ما الخبرة ذات الصلة لديك؟' }), { hint: 'من 50 إلى 1000 حرف.' }),
    h('div', { class: 'form-grid' },
      field('رابط ملف الأعمال أو GitHub', input({ name: 'portfolioUrl', type: 'url', dir: 'ltr', value: me.portfolioUrl || '', placeholder: 'https://github.com/username', inputmode: 'url' }), { optional: true }),
      field('مدة التسليم المتوقعة (أيام)', input({ name: 'deliveryDays', type: 'number', min: 1, max: t.durationDays, inputmode: 'numeric', dir: 'ltr', value: String(t.durationDays) }), { hint: `بحد أقصى ${fmtDays(t.durationDays)} حسب مدة المهمة.` })),
    note('سيصل طلبك إلى الشركة فوراً في هذا المتصفح. لا يُرسل أي بريد إلكتروني حقيقي.', 'info'),
    h('div', { class: 'form-actions' }, submit));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const proposal = String(fd.get('proposal')).trim();
    const portfolioUrl = String(fd.get('portfolioUrl')).trim();
    const days = Number(fd.get('deliveryDays'));
    const errors = {};
    if (proposal.length < 50) errors.proposal = `العرض قصير: ${proposal.length} من 50 حرفاً على الأقل.`;
    if (portfolioUrl && !isUrl(portfolioUrl)) errors.portfolioUrl = 'أدخل رابطاً كاملاً يبدأ بـ https://';
    if (!Number.isInteger(days) || days < 1) errors.deliveryDays = 'أدخل عدد أيام صحيحاً (1 على الأقل).';
    else if (days > t.durationDays) errors.deliveryDays = `المدة أطول من مدة المهمة (${fmtDays(t.durationDays)}).`;
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ الإرسال…', () => store.applyToTask(t.id, { proposal, portfolioUrl, deliveryDays: days }));
      toast(`أُرسل طلبك إلى ${store.companyById(t.companyId).name}.`);
    } catch (err) { reportError(err); }
  });
  return section('قدّم على المهمة', form, { ico: 'send', id: 'apply' });
}

// ---------- applications ----------
export function applications() {
  const me = store.currentStudent();
  const apps = store.studentApplications(me.id);
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'طلباتي', title: 'طلبات التقديم', subtitle: 'تابع حالة كل طلب أرسلته.' }),
    apps.length ? h('ul', { class: 'app-list' }, apps.map((a) => {
      const t = store.taskById(a.taskId);
      const c = store.companyById(t.companyId);
      const p = a.status === 'accepted' && store.projectForTask(t.id);
      return h('li', { class: 'app-item card-raised' },
        h('div', { class: 'app-main' },
          h('h2', { class: 'app-title' }, h('a', { href: `#/tasks/${t.id}` }, t.title)),
          h('p', { class: 'muted small' }, `${c.name} · أُرسل ${fmtRelative(a.createdAt)} · ${fmtDays(a.deliveryDays)} · `, bdi(fmtJOD(t.budget)))),
        h('div', { class: 'app-side' },
          statusBadge(APPLICATION_STATUS, a.status),
          p && h('a', { class: 'btn btn-primary btn-sm', href: `#/projects/${p.id}` }, 'فتح المشروع')));
    })) : emptyState({ ico: 'file', title: 'لم تتقدّم لأي مهمة بعد', text: 'اختر مهمة تناسب مهاراتك وأرسل عرضك.', action: h('a', { class: 'btn btn-primary', href: '#/tasks' }, 'استكشف المهام') }));
}

