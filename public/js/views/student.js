// Student pages: dashboard, task discovery, task detail with application, applications and offers.
import { h, bdi, fmtJOD, fmtDate, fmtDays, fmtRelative, fmtDateTime, isUrl } from '../dom.js';
import { icon } from '../icons.js';
import { CATEGORIES, APPLICATION_STATUS, OFFER_STATUS, categoryOf } from '../data.js';
import {
  pageHeader, section, stat, emptyState, badge, statusBadge, skillChips, field, input, textarea,
  select, showErrors, serverErrors, liveClear, busy, toast, reportError, note, extLink, confirmDialog, pager, loadingState, errorState, formDialog,
} from '../ui.js';
import { api, session } from '../api.js';
import { navigate, refresh } from '../router.js';
import { taskCard, projectRow, notificationRow, skillSet, deadlineText, saveButton, companyLine } from './common.js';

// ---------- dashboard ----------
export async function studentDashboard() {
  const [counts, profile, tasks, projects, apps, notes] = await Promise.all([
    api.get('/dashboard'), api.get('/me/profile'),
    api.get('/tasks', { pageSize: 3 }), api.get('/projects'),
    api.get('/me/applications', { pageSize: 5 }), api.get('/notifications', { pageSize: 5 }),
  ]);
  const mine = skillSet(profile.skills);
  const relevant = profile.skills.length
    ? (await api.get('/tasks', { pageSize: 3, skills: profile.skills.join(',') })).items
    : tasks.items;
  const ongoing = projects.items.filter((p) => !['completed', 'cancelled'].includes(p.status));
  const pendingOffers = apps.items.filter((a) => a.offerStatus === 'pending');
  const profileIncomplete = !profile.university || !profile.bio || !profile.skills.length;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'لوحة الطالب', title: `أهلاً، ${profile.fullName.split(' ')[0]}`, subtitle: 'ملخص طلباتك وعروضك ومشاريعك والمهام المناسبة لمهاراتك.',
      actions: h('a', { class: 'btn btn-primary', href: '#/tasks' }, icon('search'), 'استكشف المهام'),
    }),
    profileIncomplete && note('أكمل ملفك (الجامعة، التخصص، النبذة والمهارات) حتى تظهر للشركات بصورة واضحة.', 'info'),
    profileIncomplete && h('p', null, h('a', { class: 'btn btn-ghost btn-sm', href: '#/settings' }, icon('edit'), 'إكمال الملف')),
    h('div', { class: 'stats' },
      stat('طلبات قيد المراجعة', counts.pendingApplications, 'file', '/applications'),
      stat('عروض بانتظار ردّك', counts.pendingOffers, 'inbox', '/applications'),
      stat('مشاريع جارية', counts.activeProjects, 'folder', '/projects'),
      stat('مشاريع مكتملة', counts.completedProjects, 'award', '/portfolio')),
    pendingOffers.length > 0 && section('عروض بانتظار ردّك', h('ul', { class: 'rows' }, pendingOffers.map((a) => h('li', null,
      h('a', { class: 'row-link', href: '#/applications' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, a.taskTitle), h('span', { class: 'row-sub' }, `${a.companyName} · ينتهي ${fmtDateTime(a.offerExpiresAt)}`)),
        statusBadge(OFFER_STATUS, 'pending'))))), { ico: 'inbox' }),
    h('div', { class: 'dash-grid' },
      section('مهام تناسب مهاراتك', relevant.length
        ? h('div', { class: 'card-list' }, relevant.map((t) => taskCard(t, { compact: true, mySkills: mine })))
        : emptyState({ ico: 'search', title: 'لا توجد مهام مطابقة حالياً', text: 'جرّب تصفّح كل المهام أو حدّث مهاراتك.' }),
      { ico: 'target', action: h('a', { class: 'link', href: '#/tasks' }, 'كل المهام') }),
      h('div', { class: 'stack' },
        section('مشاريعك الجارية', ongoing.length
          ? h('ul', { class: 'rows' }, ongoing.map(projectRow))
          : emptyState({ ico: 'folder', title: 'لا توجد مشاريع جارية', text: 'عندما تقبل عرضاً من شركة يبدأ المشروع هنا.' }),
        { ico: 'folder' }),
        section('آخر طلباتك', apps.items.length
          ? h('ul', { class: 'rows' }, apps.items.map((a) => h('li', null, h('a', { class: 'row-link', href: `#/tasks/${a.taskId}` },
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, a.taskTitle), h('span', { class: 'row-sub' }, `${a.companyName} · ${fmtRelative(a.createdAt)}`)),
            statusBadge(APPLICATION_STATUS, a.status)))))
          : emptyState({ ico: 'file', title: 'لم تتقدّم لأي مهمة بعد', action: h('a', { class: 'btn btn-ghost btn-sm', href: '#/tasks' }, 'تصفّح المهام') }),
        { ico: 'file', action: h('a', { class: 'link', href: '#/applications' }, 'كل الطلبات') })),
      section('الإشعارات', notes.items.length
        ? h('ul', { class: 'rows' }, notes.items.map(notificationRow))
        : emptyState({ ico: 'bell', title: 'لا إشعارات بعد', text: 'تظهر هنا تحديثات طلباتك ومشاريعك عند حدوثها.' }),
      { ico: 'bell', action: notes.items.length ? h('a', { class: 'link', href: '#/notifications' }, 'عرض الكل') : null }),
      section('ملف إنجازاتك', h('div', { class: 'portfolio-mini' },
        h('div', { class: 'mini-stats' },
          h('div', null, h('strong', null, String(profile.projects.length)), h('span', null, 'مشاريع مكتملة')),
          h('div', null, h('strong', null, profile.averageRating ?? '—'), h('span', null, 'متوسط التقييم')),
          h('div', null, h('strong', null, String(profile.skills.length)), h('span', null, 'مهارات'))),
        profile.skills.length ? skillChips(profile.skills) : h('p', { class: 'muted small' }, 'لم تُضف مهارات بعد.'),
        h('a', { class: 'btn btn-ghost btn-block', href: '#/portfolio' }, icon('award'), 'عرض ملف الإنجازات')),
      { ico: 'award' })));
}

// ---------- discovery ----------
const FILTER_KEY = 'mihmah:filters';
const DEFAULT_FILTERS = { q: '', category: '', skills: [], budget: '', duration: '', sort: 'newest', savedOnly: false };
const filters = loadFilters();
let filtersOpen = null;
let currentPage = 1;

function loadFilters() {
  try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(FILTER_KEY)) }; } catch { return { ...DEFAULT_FILTERS }; }
}
function saveFilters() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* preference only */ }
}
export function resetFilters() {
  Object.assign(filters, structuredClone(DEFAULT_FILTERS));
  currentPage = 1;
  saveFilters();
}

const BUDGETS = { '': {}, lt75: { budgetMax: 74.999 }, '75-120': { budgetMin: 75, budgetMax: 120 }, gt120: { budgetMin: 120.001 } };
const DURATIONS = { '': {}, week: { durationMax: 7 }, two: { durationMin: 8, durationMax: 14 }, long: { durationMin: 15 } };
const BUDGET_OPTS = [['', 'كل الميزانيات'], ['lt75', 'أقل من 75 د.أ'], ['75-120', 'من 75 إلى 120 د.أ'], ['gt120', 'أكثر من 120 د.أ']];
const DURATION_OPTS = [['', 'كل المدد'], ['week', 'أسبوع أو أقل'], ['two', 'من 8 إلى 14 يوماً'], ['long', 'أكثر من أسبوعين']];
const SORTS = [['newest', 'الأحدث'], ['budget_desc', 'الميزانية: الأعلى أولاً'], ['budget_asc', 'الميزانية: الأقل أولاً'], ['deadline', 'أقرب موعد تسليم']];

export async function discovery() {
  const [skillsRes, profile] = await Promise.all([api.get('/skills'), api.get('/me/profile')]);
  const allSkills = skillsRes.items;
  const mine = skillSet(profile.skills);
  filters.skills = filters.skills.filter((s) => allSkills.includes(s));

  const count = h('p', { class: 'result-count', role: 'status' });
  const results = h('div', { class: 'task-grid', 'aria-busy': 'false' });
  const pagerSlot = h('div');
  const resetBtn = h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: reset }, icon('refresh'), 'إعادة ضبط الفلاتر');

  let timer;
  const onChange = (key, debounce = 0) => (e) => {
    filters[key] = e.target.value;
    currentPage = 1;
    clearTimeout(timer);
    timer = setTimeout(update, debounce);
  };
  const search = h('div', { class: 'search-box' }, icon('search'),
    h('input', { id: 'f-q', class: 'input', type: 'search', value: filters.q, placeholder: 'ابحث بالعنوان أو الشركة أو المهارة', 'aria-label': 'بحث في المهام', oninput: onChange('q', 300) }));
  const labeled = (label, control) => h('label', { class: 'filter-field' }, h('span', { class: 'filter-label' }, label), control);
  const controls = h('div', { class: 'filter-row' },
    labeled('الفئة', select({ id: 'f-cat', value: filters.category, onchange: onChange('category') }, CATEGORIES.map((c) => [c.id, c.label]), 'كل الفئات')),
    labeled('الميزانية', select({ id: 'f-budget', value: filters.budget, onchange: onChange('budget') }, BUDGET_OPTS)),
    labeled('المدة', select({ id: 'f-dur', value: filters.duration, onchange: onChange('duration') }, DURATION_OPTS)),
    labeled('الترتيب', select({ id: 'f-sort', value: filters.sort, onchange: onChange('sort') }, SORTS)));
  const savedToggle = h('button', {
    type: 'button', id: 'f-saved', class: 'toggle-btn', 'aria-pressed': String(filters.savedOnly),
    onclick: (e) => { filters.savedOnly = !filters.savedOnly; currentPage = 1; e.currentTarget.setAttribute('aria-pressed', String(filters.savedOnly)); update(); },
  }, icon('bookmark'), 'المحفوظة فقط');
  const skillBtns = h('div', { class: 'skill-filter', role: 'group', 'aria-labelledby': 'skills-label' },
    h('span', { id: 'skills-label', class: 'filter-label' }, 'المهارات:'),
    allSkills.slice(0, 24).map((s) => h('button', {
      type: 'button', class: 'chip chip-btn', 'aria-pressed': String(filters.skills.includes(s)),
      onclick: (e) => {
        const on = !filters.skills.includes(s);
        filters.skills = on ? [...filters.skills, s] : filters.skills.filter((x) => x !== s);
        currentPage = 1;
        e.currentTarget.setAttribute('aria-pressed', String(on));
        update();
      },
    }, bdi(s))));
  const activeCount = () => [filters.category, filters.budget, filters.duration].filter(Boolean).length + filters.skills.length + (filters.savedOnly ? 1 : 0);
  const activeBadge = h('span', { class: 'filter-active' });
  const more = h('details', {
    class: 'filter-more', open: filtersOpen ?? (matchMedia('(min-width: 900px)').matches || activeCount() > 0),
    ontoggle: (e) => { filtersOpen = e.currentTarget.open; },
  },
  h('summary', { class: 'filter-toggle' }, icon('filter'), h('span', null, 'الفلاتر والترتيب'), activeBadge, icon('chevron-left', 'faq-chev')),
  h('div', { class: 'filter-body' }, controls, h('div', { class: 'filter-foot' }, skillBtns, h('div', { class: 'filter-actions' }, savedToggle, resetBtn))));

  function reset() {
    resetFilters();
    navigate('/tasks');
    document.getElementById('f-q')?.focus();
  }

  let req = 0;
  async function update() {
    const my = ++req;
    saveFilters();
    const n = activeCount();
    activeBadge.textContent = n ? `${n} مفعّلة` : '';
    results.setAttribute('aria-busy', 'true');
    if (!results.children.length) results.replaceChildren(loadingState('جارٍ تحميل المهام…'));
    try {
      const data = await api.get('/tasks', {
        q: filters.q.trim(), category: filters.category, skills: filters.skills.join(','), sort: filters.sort,
        saved: filters.savedOnly ? '1' : '', page: currentPage, pageSize: 12,
        ...BUDGETS[filters.budget], ...DURATIONS[filters.duration],
      });
      if (my !== req) return;
      count.textContent = data.total ? `${data.total} مهمة مطابقة` : 'لا توجد نتائج مطابقة';
      results.replaceChildren(...(data.items.length ? data.items.map((t) => taskCard(t, { mySkills: mine })) : [emptyState({
        ico: 'search', title: 'لا توجد مهام تطابق اختيارك',
        text: filters.savedOnly ? 'لا توجد مهام محفوظة مطابقة. استخدم زر الحفظ على بطاقة المهمة.' : 'جرّب كلمات بحث أخرى أو خفّف الفلاتر.',
        action: h('button', { type: 'button', class: 'btn btn-primary', onclick: reset }, icon('refresh'), 'إعادة ضبط الفلاتر'),
      })]));
      pagerSlot.replaceChildren(pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => { currentPage = p; update(); window.scrollTo({ top: 0 }); } }) || '');
    } catch (err) {
      if (my !== req) return;
      count.textContent = '';
      results.replaceChildren(errorState(err, update));
    } finally {
      if (my === req) results.setAttribute('aria-busy', 'false');
    }
  }
  await update();

  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'استكشف', title: 'المهام المتاحة', subtitle: 'مهام قصيرة بميزانيات ثابتة بالدينار الأردني. لا تُنقل أموال عبر المنصة حتى ربط مزوّد دفع.' }),
    h('section', { class: 'filters panel', 'aria-label': 'البحث والفلاتر' }, search, more),
    count, results, pagerSlot);
}

// ---------- task detail ----------
export async function taskDetail({ params }) {
  // Admins (e.g. from the reports queue) and companies get the same page read-only.
  const isStudent = session.user.role === 'student';
  const [t, profile] = await Promise.all([api.get(`/tasks/${params.id}`), isStudent ? api.get('/me/profile') : null]);
  const cat = categoryOf(t.category);
  const mine = skillSet(profile?.skills);
  const app = t.myApplication;
  const isOpen = t.status === 'published' && t.moderationStatus === 'visible';
  const back = { student: ['#/tasks', 'العودة إلى المهام'], admin: ['#/admin/reports', 'العودة إلى البلاغات'], company: ['#/company/tasks', 'العودة إلى مهامي'] }[session.user.role];

  return h('div', { class: 'page' },
    h('a', { class: 'back-link', href: back[0] }, icon('chevron-right'), back[1]),
    pageHeader({
      eyebrow: cat.label, title: t.title, subtitle: companyLine(t),
      actions: isStudent && [
        isOpen && saveButton(t),
        isOpen && !app && session.user.emailVerified && h('a', { class: 'btn btn-primary', href: '#apply', onclick: (e) => { e.preventDefault(); document.getElementById('apply-proposal')?.focus(); } }, 'قدّم الآن'),
        h('button', { type: 'button', class: 'btn btn-text', onclick: () => reportDialog('task', t.id) }, icon('alert'), 'إبلاغ'),
      ],
    }),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'stack' },
        section('نبذة', h('p', { class: 'prose' }, t.summary), { ico: 'info' }),
        section('نطاق العمل', h('p', { class: 'prose' }, t.scope), { ico: 'target' }),
        section('المخرجات المطلوبة', h('ul', { class: 'check-list' }, t.deliverables.map((d) => h('li', null, icon('check'), h('span', null, d)))), { ico: 'file' }),
        section('المهارات المطلوبة', [skillChips(t.skills, mine),
          isStudent && h('p', { class: 'field-hint' }, `تطابق ${t.skills.filter((s) => mine.has(s.toLowerCase())).length} من ${t.skills.length} مع مهارات ملفك.`)], { ico: 'code' }),
        section('المراحل المقترحة', h('ol', { class: 'milestone-list' }, t.milestones.map((m, i) => h('li', null, h('span', { class: 'ms-num' }, String(i + 1)), h('span', null, m)))), { ico: 'milestones' }),
        isStudent && applyBlock(t, app, profile, isOpen)),
      h('aside', { class: 'stack', 'aria-label': 'ملخص المهمة' },
        h('div', { class: 'panel budget-card' },
          h('p', { class: 'budget-label' }, 'الميزانية الثابتة'),
          h('p', { class: 'budget-value' }, bdi(fmtJOD(t.budget))),
          note('لا تُحصَّل أو تُحوَّل أي مبالغ عبر المنصة حالياً؛ الدفع الإلكتروني بانتظار ربط مزوّد يدعم الأردن.', 'shield')),
        h('dl', { class: 'panel facts' },
          fact('clock', 'مدة التنفيذ', fmtDays(t.durationDays)),
          fact('calendar', 'موعد التسليم (بتوقيت عمّان)', `${fmtDate(t.deadlineAt)} — ${deadlineText(t.deadlineAt)}`),
          fact('users', 'عدد المتقدّمين', String(t.applicantCount)),
          t.publishedAt && fact('history', 'تاريخ النشر', fmtDate(t.publishedAt))),
        h('section', { class: 'panel', 'aria-labelledby': 'co-title' },
          h('h2', { class: 'panel-title', id: 'co-title' }, icon('building'), 'عن الشركة'),
          h('p', { class: 'company-name' }, h('a', { href: `#/companies/${t.companyId}`, class: 'plain-link' }, t.companyName)),
          h('p', { class: 'muted small' }, [t.companyIndustry, t.companyCity].filter(Boolean).join(' · ')),
          t.companyBio && h('p', { class: 'prose' }, t.companyBio)))));
}

const fact = (ico, label, value) => h('div', { class: 'fact' }, h('dt', null, icon(ico), label), h('dd', null, value));

function applyBlock(t, app, profile, isOpen) {
  if (app) {
    const offerPending = app.offerStatus === 'pending';
    return section('طلبك', h('div', { class: 'stack-sm' },
      h('p', null, statusBadge(APPLICATION_STATUS, app.status), ' ', app.offerStatus && statusBadge(OFFER_STATUS, app.offerStatus), ' ',
        h('span', { class: 'muted small' }, `أُرسل ${fmtRelative(app.createdAt)}`)),
      note('لا يمكن إرسال أكثر من طلب للمهمة نفسها.', 'info'),
      h('p', { class: 'prose quote' }, app.proposal),
      h('p', { class: 'small muted' }, `مدة التسليم المتوقعة: ${fmtDays(app.deliveryDays)}`),
      app.portfolioUrl && extLink(app.portfolioUrl),
      offerPending && offerActions(app, t.title),
      app.projectId && h('a', { class: 'btn btn-primary', href: `#/projects/${app.projectId}` }, icon('folder'), 'فتح مساحة المشروع'),
      app.status === 'submitted' && withdrawButton(app.id)),
    { ico: 'file', id: 'apply' });
  }
  if (!isOpen) return section('التقديم', note('هذه المهمة لا تستقبل طلبات حالياً.', 'info'), { ico: 'file', id: 'apply' });
  if (!session.user.emailVerified) {
    return section('قدّم على المهمة', note('أكّد بريدك الإلكتروني أولاً لتتمكن من التقديم. استخدم زر «إعادة إرسال الرابط» في أعلى الصفحة.', 'alert'), { ico: 'send', id: 'apply' });
  }

  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, icon('send'), 'إرسال الطلب');
  const form = h('form', { class: 'stack', novalidate: true },
    field('عرضك المختصر', textarea({ name: 'proposal', id: 'apply-proposal', rows: 5, maxlength: 2000, placeholder: 'كيف ستنفّذ المهمة؟ ما الخبرة ذات الصلة لديك؟' }), { hint: 'من 50 إلى 2000 حرف.' }),
    h('div', { class: 'form-grid' },
      field('رابط ملف الأعمال أو GitHub', input({ name: 'portfolioUrl', type: 'url', dir: 'ltr', value: profile.portfolioUrl || '', placeholder: 'https://github.com/username', inputmode: 'url' }), { optional: true }),
      field('مدة التسليم المتوقعة (أيام)', input({ name: 'deliveryDays', type: 'number', min: 1, max: t.durationDays, inputmode: 'numeric', dir: 'ltr', value: String(t.durationDays) }), { hint: `بحد أقصى ${fmtDays(t.durationDays)}.` })),
    h('div', { class: 'form-actions' }, submit));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const proposal = form.proposal.value.trim();
    const portfolioUrl = form.portfolioUrl.value.trim();
    const days = Number(form.deliveryDays.value);
    const errors = {};
    if (proposal.length < 50) errors.proposal = `العرض قصير: ${proposal.length} من 50 حرفاً على الأقل.`;
    if (portfolioUrl && !isUrl(portfolioUrl)) errors.portfolioUrl = 'أدخل رابطاً كاملاً يبدأ بـ https://';
    if (!Number.isInteger(days) || days < 1) errors.deliveryDays = 'أدخل عدد أيام صحيحاً (1 على الأقل).';
    else if (days > t.durationDays) errors.deliveryDays = `المدة أطول من مدة المهمة (${fmtDays(t.durationDays)}).`;
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ الإرسال…', () => api.post(`/tasks/${t.id}/applications`, { proposal, portfolioUrl: portfolioUrl || null, deliveryDays: days }));
      toast(`أُرسل طلبك إلى ${t.companyName}.`);
      refresh();
    } catch (err) { serverErrors(form, err); }
  });
  return section('قدّم على المهمة', form, { ico: 'send', id: 'apply' });
}

function withdrawButton(appId) {
  return h('button', {
    type: 'button', class: 'btn btn-ghost', onclick: async (e) => {
      const btn = e.currentTarget;
      if (!await confirmDialog({ title: 'سحب الطلب؟', body: h('p', null, 'لن تتمكن من التقديم على هذه المهمة مرة أخرى بعد السحب.'), confirmLabel: 'سحب الطلب', danger: true })) return;
      try {
        await busy(btn, 'جارٍ السحب…', () => api.post(`/applications/${appId}/withdraw`));
        toast('سُحب طلبك.', 'info');
        refresh();
      } catch (err) { reportError(err); }
    },
  }, icon('x'), 'سحب الطلب');
}

function offerActions(app, taskTitle) {
  const accept = h('button', {
    type: 'button', class: 'btn btn-primary', id: `accept-${app.offerId}`, onclick: async () => {
      const ok = await confirmDialog({
        title: 'قبول العرض وبدء المشروع؟',
        body: h('div', { class: 'stack-sm' },
          h('p', null, `بقبولك يبدأ مشروع «${taskTitle}» فوراً وتُسند المهمة إليك.`),
          note(session.payments.provider === 'sandbox'
            ? 'بيئة دفع تجريبية: يُنشأ سجل دفع للمشروع وتُحاكى حالاته فقط، دون نقل أموال حقيقية.'
            : 'الدفع الإلكتروني غير مفعّل بعد؛ يُسجَّل المبلغ في المشروع بحالة «بانتظار ربط مزوّد الدفع».', 'shield')),
        confirmLabel: 'قبول العرض',
      });
      if (!ok) return;
      try {
        const res = await busy(accept, 'جارٍ القبول…', () => api.post(`/offers/${app.offerId}/accept`));
        toast('قبلت العرض. بدأ المشروع!');
        navigate(`/projects/${res.projectId}`);
      } catch (err) { reportError(err); refresh(); }
    },
  }, icon('check'), 'قبول العرض');
  const decline = h('button', {
    type: 'button', class: 'btn btn-ghost', onclick: async () => {
      if (!await confirmDialog({ title: 'الاعتذار عن العرض؟', body: h('p', null, 'سيُبلَّغ صاحب المهمة باعتذارك، ولا يمكن التراجع.'), confirmLabel: 'اعتذار', danger: true })) return;
      try {
        await busy(decline, 'جارٍ الإرسال…', () => api.post(`/offers/${app.offerId}/decline`));
        toast('أُرسل اعتذارك.', 'info');
        refresh();
      } catch (err) { reportError(err); }
    },
  }, 'اعتذار');
  return h('div', { class: 'offer-box' },
    h('p', { class: 'offer-title' }, icon('inbox'), 'وصلك عرض لتنفيذ هذه المهمة'),
    app.offerMessage && h('p', { class: 'prose quote' }, app.offerMessage),
    h('p', { class: 'small muted' }, `صالح حتى ${fmtDateTime(app.offerExpiresAt)} بتوقيت عمّان`),
    h('div', { class: 'btn-row' }, accept, decline));
}

export async function reportDialog(targetType, targetId) {
  const fd = await formDialog({
    title: 'إبلاغ الإدارة',
    description: 'يصل البلاغ إلى فريق الإدارة فقط. اذكر تفاصيل كافية للمراجعة.',
    fields: [
      field('السبب', select({ name: 'reason' }, [['spam', 'محتوى مزعج أو مكرر'], ['fraud', 'احتيال أو انتحال'], ['inappropriate', 'محتوى غير لائق'], ['dispute', 'نزاع حول المشروع'], ['other', 'سبب آخر']], 'اختر السبب')),
      field('التفاصيل', textarea({ name: 'details', rows: 4, maxlength: 2000 }), { hint: '10 أحرف على الأقل.' }),
    ],
    submitLabel: 'إرسال البلاغ',
    validate: (form) => ({
      reason: form.elements.namedItem('reason').value ? null : 'اختر سبب البلاغ.',
      details: form.elements.namedItem('details').value.trim().length < 10 ? 'اكتب تفاصيل أكثر (10 أحرف على الأقل).' : null,
    }),
  });
  if (!fd) return;
  try {
    const res = await api.post('/reports', { targetType, targetId, reason: fd.get('reason'), details: String(fd.get('details')).trim() });
    toast(res.message);
  } catch (err) { reportError(err); }
}

// ---------- applications & offers ----------
export async function applications({ query }) {
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/me/applications', { page, pageSize: 20 });
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'طلباتي', title: 'الطلبات والعروض', subtitle: 'تابع حالة طلباتك، واقبل العروض قبل انتهاء صلاحيتها.' }),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((a) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('h2', { class: 'app-title' }, h('a', { href: `#/tasks/${a.taskId}` }, a.taskTitle)),
        h('p', { class: 'muted small' }, `${a.companyName} · أُرسل ${fmtRelative(a.createdAt)} · ${fmtDays(a.deliveryDays)} · `, bdi(fmtJOD(a.budget))),
        a.offerStatus === 'pending' && offerActions({ ...a, id: a.id }, a.taskTitle)),
      h('div', { class: 'app-side' },
        statusBadge(APPLICATION_STATUS, a.status),
        a.offerStatus && statusBadge(OFFER_STATUS, a.offerStatus),
        a.projectId && h('a', { class: 'btn btn-primary btn-sm', href: `#/projects/${a.projectId}` }, 'فتح المشروع'),
        a.status === 'submitted' && withdrawButton(a.id)))))
      : emptyState({ ico: 'file', title: 'لم تتقدّم لأي مهمة بعد', text: 'اختر مهمة تناسب مهاراتك وأرسل عرضك.', action: h('a', { class: 'btn btn-primary', href: '#/tasks' }, 'استكشف المهام') }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => navigate(`/applications?page=${p}`) }));
}

