// Company pages: dashboard, task management, task editor (drafts + publishing) and applicant review.
import { h, bdi, fmtJOD, fmtDate, fmtDays, fmtRelative, fmtDateTime, todayStr, daysUntil, parseList, ammanDate } from '../dom.js';
import { icon } from '../icons.js';
import { CATEGORIES, APPLICATION_STATUS, OFFER_STATUS, TASK_STATUS, categoryOf } from '../data.js';
import {
  pageHeader, section, stat, emptyState, statusBadge, badge, demoBadge, skillChips, field, input, textarea, select,
  showErrors, liveClear, busy, toast, reportError, note, extLink, confirmDialog, formDialog, avatar, pager,
} from '../ui.js';
import { api, session } from '../api.js';
import { navigate, refresh } from '../router.js';
import { skillsField, parseSkills } from './settings.js';
import { projectRow, notificationRow, deadlineText } from './common.js';

// ---------- dashboard ----------
export async function companyDashboard() {
  const [counts, profile, tasks, projects, notes] = await Promise.all([
    api.get('/dashboard'), api.get('/me/profile'), api.get('/company/tasks', { pageSize: 6 }),
    api.get('/projects'), api.get('/notifications', { pageSize: 5 }),
  ]);
  const active = projects.items.filter((p) => ['in_progress', 'awaiting_review', 'revision_requested'].includes(p.status));
  const awaiting = projects.items.filter((p) => p.status === 'awaiting_review');
  const incomplete = !profile.industry || !profile.city || !profile.bio;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: profile.companyName, title: `أهلاً، ${profile.contactName.split(' ')[0]}`, subtitle: 'كل الأرقام محسوبة مباشرة من سجلات المهام والطلبات والمشاريع.',
      actions: h('a', { class: 'btn btn-primary', href: '#/company/publish' }, icon('plus'), 'انشر مهمّة'),
    }),
    incomplete && note('أكمل ملف الشركة (القطاع، المدينة، النبذة) ليتعرّف عليك الطلاب ولتتمكن من طلب التوثيق.', 'info'),
    incomplete && h('p', null, h('a', { class: 'btn btn-ghost btn-sm', href: '#/settings' }, icon('edit'), 'إكمال الملف')),
    h('div', { class: 'stats' },
      stat('مهام منشورة', counts.publishedTasks, 'briefcase', '/company/tasks?status=published'),
      stat('متقدّمون بانتظار قرارك', counts.pendingApplicants, 'users', '/company/tasks?status=published'),
      stat('مشاريع نشطة', counts.activeProjects, 'folder', '/projects'),
      stat('أعمال بانتظار مراجعتك', counts.awaitingReview, 'eye', '/projects')),
    h('div', { class: 'dash-grid' },
      section('بانتظار مراجعتك', awaiting.length ? h('ul', { class: 'rows' }, awaiting.map(projectRow))
        : emptyState({ ico: 'eye', title: 'لا توجد أعمال بانتظار المراجعة', text: 'عندما يسلّم طالب عمله يظهر هنا.' }), { ico: 'eye' }),
      section('مهامك', tasks.items.length ? h('ul', { class: 'rows' }, tasks.items.map(taskRow))
        : emptyState({ ico: 'briefcase', title: 'لم تنشئ أي مهمة بعد', action: h('a', { class: 'btn btn-primary btn-sm', href: '#/company/publish' }, 'أنشئ أول مهمة') }),
      { ico: 'briefcase', action: h('a', { class: 'link', href: '#/company/tasks' }, 'كل المهام') }),
      section('المشاريع النشطة', active.length ? h('ul', { class: 'rows' }, active.map(projectRow))
        : emptyState({ ico: 'folder', title: 'لا توجد مشاريع نشطة', text: 'أرسل عرضاً لأحد المتقدّمين؛ يبدأ المشروع عند قبوله.' }), { ico: 'folder' }),
      section('الإشعارات', notes.items.length ? h('ul', { class: 'rows' }, notes.items.map(notificationRow))
        : emptyState({ ico: 'bell', title: 'لا إشعارات بعد', text: 'تظهر هنا الطلبات الجديدة والتسليمات والرسائل.' }),
      { ico: 'bell', action: notes.items.length ? h('a', { class: 'link', href: '#/notifications' }, 'عرض الكل') : null })));
}

function taskRow(t) {
  const href = t.projectId ? `#/projects/${t.projectId}` : t.status === 'draft' ? `#/company/tasks/${t.id}/edit` : `#/company/tasks/${t.id}`;
  return h('li', null, h('a', { class: 'row-link', href },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t.title),
      h('span', { class: 'row-sub' }, t.status === 'draft' ? 'مسودة غير منشورة' : `${t.applicantCount} متقدّم${t.submittedCount ? ` · ${t.submittedCount} بانتظار القرار` : ''}`)),
    statusBadge(TASK_STATUS, t.status)));
}

// ---------- task list ----------
const TABS = [['', 'الكل'], ['draft', 'مسودات'], ['published', 'منشورة'], ['assigned', 'مُسندة'], ['completed', 'مكتملة'], ['cancelled', 'ملغاة']];

export async function companyTasks({ query }) {
  const status = query.get('status') || '';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/company/tasks', { status, page, pageSize: 20 });
  const go = (s, p = 1) => navigate(`/company/tasks${s || p > 1 ? `?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(p > 1 ? { page: p } : {}) })}` : ''}`);

  const actions = (t) => {
    const btns = [];
    if (t.status === 'draft') {
      btns.push(h('a', { class: 'btn btn-ghost btn-sm', href: `#/company/tasks/${t.id}/edit` }, icon('edit'), 'تعديل'));
      btns.push(h('button', {
        type: 'button', class: 'btn btn-primary btn-sm', onclick: async (e) => {
          const btn = e.currentTarget;
          try { await busy(btn, 'جارٍ النشر…', () => api.post(`/tasks/${t.id}/publish`)); toast('نُشرت المهمة وتظهر الآن للطلاب.'); refresh(); } catch (err) { reportError(err); }
        },
      }, 'نشر'));
      btns.push(h('button', {
        type: 'button', class: 'btn btn-text btn-sm', onclick: async () => {
          if (!await confirmDialog({ title: 'حذف المسودة؟', body: h('p', null, `ستُحذف «${t.title}» نهائياً.`), confirmLabel: 'حذف', danger: true })) return;
          try { await api.del(`/tasks/${t.id}`); toast('حُذفت المسودة.', 'info'); refresh(); } catch (err) { reportError(err); }
        },
      }, 'حذف'));
    }
    if (t.status === 'published') {
      btns.push(h('a', { class: 'btn btn-primary btn-sm', href: `#/company/tasks/${t.id}` }, `المتقدّمون (${t.applicantCount})`));
      if (t.applicantCount === 0) btns.push(h('a', { class: 'btn btn-ghost btn-sm', href: `#/company/tasks/${t.id}/edit` }, icon('edit'), 'تعديل'));
    }
    if (['draft', 'published'].includes(t.status)) btns.push(cancelButton(t));
    if (t.projectId) btns.push(h('a', { class: 'btn btn-ghost btn-sm', href: `#/projects/${t.projectId}` }, 'فتح المشروع'));
    return btns;
  };

  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'إدارة المهام', title: 'مهامي', subtitle: 'المسودات لا يراها أحد غيرك. المهام المنشورة تظهر للطلاب حتى إسنادها أو إلغائها.', actions: h('a', { class: 'btn btn-primary', href: '#/company/publish' }, icon('plus'), 'انشر مهمّة') }),
    h('nav', { class: 'tabs', 'aria-label': 'تصفية حسب الحالة' }, TABS.map(([s, label]) => h('button', {
      type: 'button', class: 'tab', 'aria-pressed': String(s === status), onclick: () => go(s),
    }, label))),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((t) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('p', null, badge(categoryOf(t.category).label, 'cat', categoryOf(t.category).icon), ' ', statusBadge(TASK_STATUS, t.status), t.moderationStatus === 'hidden' && badge('مخفية من الإدارة', 'danger')),
        h('h2', { class: 'app-title' }, h('a', { href: t.status === 'draft' ? `#/company/tasks/${t.id}/edit` : `#/company/tasks/${t.id}` }, t.title)),
        h('p', { class: 'muted small' }, bdi(fmtJOD(t.budget)), ` · ${fmtDays(t.durationDays)} · ${deadlineText(t.deadlineAt)} · أُنشئت ${fmtRelative(t.createdAt)}`),
        t.status === 'cancelled' && t.cancelReason && h('p', { class: 'small muted' }, `سبب الإلغاء: ${t.cancelReason}`)),
      h('div', { class: 'app-side' }, actions(t)))))
      : emptyState({ ico: 'briefcase', title: status ? 'لا توجد مهام بهذه الحالة' : 'لا توجد مهام بعد', text: 'ابدأ بمهمة قصيرة بنطاق واضح.', action: h('a', { class: 'btn btn-primary', href: '#/company/publish' }, 'انشر مهمّة') }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go(status, p) }));
}

function cancelButton(t) {
  return h('button', {
    type: 'button', class: 'btn btn-text btn-sm', onclick: async () => {
      const fd = await formDialog({
        title: 'إلغاء المهمة؟',
        description: t.status === 'published' ? 'سيُبلَّغ كل المتقدّمين وتُسحب العروض المعلّقة. لا يمكن التراجع.' : 'ستنتقل المسودة إلى الملغاة.',
        fields: [field('سبب الإلغاء', textarea({ name: 'reason', rows: 3, maxlength: 300 }), { hint: 'يظهر للمتقدّمين في الإشعار (5 أحرف على الأقل).' })],
        submitLabel: 'إلغاء المهمة', danger: true,
        validate: (f) => ({ reason: f.elements.namedItem('reason').value.trim().length < 5 ? 'اكتب سبباً واضحاً.' : null }),
      });
      if (!fd) return;
      try { await api.post(`/tasks/${t.id}/cancel`, { reason: String(fd.get('reason')).trim() }); toast('أُلغيت المهمة.', 'info'); refresh(); } catch (err) { reportError(err); }
    },
  }, 'إلغاء');
}

// ---------- applicant review ----------
export async function applicants({ params }) {
  const [t, apps] = await Promise.all([api.get(`/tasks/${params.id}`), api.get(`/tasks/${params.id}/applications`)]);
  const wanted = new Set(t.skills.map((s) => s.toLowerCase()));
  const open = t.status === 'published';
  const pendingOffers = apps.items.filter((a) => a.offerStatus === 'pending').length;

  const card = (a) => {
    const matches = a.skills.filter((x) => wanted.has(x.toLowerCase()));
    const offerBtn = open && a.status === 'submitted' && h('button', {
      type: 'button', class: 'btn btn-primary', id: `offer-${a.id}`, onclick: async (e) => {
        const btn = e.currentTarget;
        if (!session.user.emailVerified) return toast('أكّد بريدك الإلكتروني قبل إرسال العروض.', 'error');
        const fd = await formDialog({
          title: `إرسال عرض إلى ${a.fullName}`,
          description: 'يصبح المشروع نشطاً عندما يقبل الطالب العرض. إذا أرسلت عروضاً لأكثر من طالب، فأول من يقبل يحصل على المهمة وتُسحب بقية العروض تلقائياً.',
          fields: [
            field('رسالة مرفقة', textarea({ name: 'message', rows: 3, maxlength: 1000, placeholder: 'مثال: نرحب بك، ونتوقع المسودة الأولى خلال 3 أيام.' }), { optional: true }),
            note('العرض صالح لمدة 72 ساعة. لا تُحصّل أي مبالغ عند الإرسال أو القبول.', 'shield'),
          ],
          submitLabel: 'إرسال العرض',
          validate: () => ({}),
        });
        if (!fd) return;
        try {
          await busy(btn, 'جارٍ الإرسال…', () => api.post(`/applications/${a.id}/offer`, { message: String(fd.get('message') || '').trim() || null }));
          toast(`أُرسل العرض إلى ${a.fullName}.`);
          refresh();
        } catch (err) { reportError(err); }
      },
    }, icon('send'), 'إرسال عرض');
    const rejectBtn = open && a.status === 'submitted' && h('button', {
      type: 'button', class: 'btn btn-text', onclick: async () => {
        if (!await confirmDialog({ title: `رفض طلب ${a.fullName}؟`, body: h('p', null, 'سيصل إشعار للطالب بعدم اختياره.'), confirmLabel: 'رفض الطلب', danger: true })) return;
        try { await api.post(`/applications/${a.id}/reject`); toast('رُفض الطلب.', 'info'); refresh(); } catch (err) { reportError(err); }
      },
    }, 'رفض');
    const withdrawBtn = a.offerStatus === 'pending' && h('button', {
      type: 'button', class: 'btn btn-text', onclick: async () => {
        if (!await confirmDialog({ title: 'سحب العرض؟', body: h('p', null, 'لن يتمكن الطالب من قبوله بعد السحب.'), confirmLabel: 'سحب العرض', danger: true })) return;
        try { await api.post(`/offers/${a.offerId}/withdraw`); toast('سُحب العرض.', 'info'); refresh(); } catch (err) { reportError(err); }
      },
    }, 'سحب العرض');

    return h('li', { class: `applicant card-raised${a.offerStatus === 'accepted' ? ' is-selected' : ''}` },
      h('div', { class: 'applicant-head' },
        avatar(a.fullName, 'avatar-lg'),
        h('div', { class: 'applicant-who' },
          h('h2', { class: 'applicant-name' }, a.fullName, ' ', a.isDemo && demoBadge()),
          h('p', { class: 'muted small' }, [a.major, a.university].filter(Boolean).join(' · ') || 'لم يُكمل الملف بعد'),
          h('p', { class: 'muted small' }, `مشاريع مكتملة على المنصة: ${a.completedProjects}`)),
        h('div', { class: 'btn-row' }, statusBadge(APPLICATION_STATUS, a.status), a.offerStatus && statusBadge(OFFER_STATUS, a.offerStatus))),
      h('div', { class: 'applicant-body' },
        h('p', { class: 'small muted' }, `المهارات المطابقة: ${matches.length} من ${t.skills.length}`),
        a.skills.length ? skillChips(a.skills, wanted) : h('p', { class: 'small muted' }, 'لم يضف مهارات.'),
        h('h3', { class: 'sub-title' }, 'العرض'),
        h('p', { class: 'prose quote' }, a.proposal),
        h('ul', { class: 'meta-row' },
          h('li', { class: 'inset-pill' }, icon('clock'), `التسليم خلال ${fmtDays(a.deliveryDays)}`),
          h('li', { class: 'inset-pill' }, icon('history'), `تقدّم ${fmtRelative(a.createdAt)}`),
          a.offerStatus === 'pending' && h('li', { class: 'inset-pill' }, icon('calendar'), `العرض صالح حتى ${fmtDateTime(a.offerExpiresAt)}`))),
      h('div', { class: 'applicant-foot' },
        a.portfolioUrl ? extLink(a.portfolioUrl, 'ملف الأعمال') : h('span', { class: 'muted small' }, 'لم يُرفق رابط أعمال'),
        h('a', { class: 'btn btn-ghost', href: `#/students/${a.studentId}` }, icon('user'), 'الملف الكامل'),
        h('span', { class: 'foot-actions' }, rejectBtn, withdrawBtn, offerBtn)));
  };

  return h('div', { class: 'page' },
    h('a', { class: 'back-link', href: '#/company/tasks' }, icon('chevron-right'), 'مهامي'),
    pageHeader({
      eyebrow: 'مراجعة المتقدّمين', title: t.title,
      subtitle: h('span', { class: 'inline-meta' }, statusBadge(TASK_STATUS, t.status), bdi(fmtJOD(t.budget)), ` · ${fmtDays(t.durationDays)} · ${deadlineText(t.deadlineAt)}`),
      actions: t.canEdit && h('a', { class: 'btn btn-ghost', href: `#/company/tasks/${t.id}/edit` }, icon('edit'), 'تعديل المهمة'),
    }),
    pendingOffers > 0 && note(`لديك ${pendingOffers} عرض بانتظار رد الطلاب. أول من يقبل يحصل على المهمة.`, 'info'),
    t.status === 'assigned' || t.status === 'completed' ? note('أُسندت هذه المهمة. تابع العمل من صفحة المشاريع.', 'check') : null,
    h('h2', { class: 'section-label' }, `المتقدّمون (${apps.items.length})`),
    apps.items.length ? h('ul', { class: 'applicants' }, apps.items.map(card)) : emptyState({
      ico: 'users', title: 'لا يوجد متقدّمون بعد',
      text: open ? 'المهمة ظاهرة الآن في صفحة استكشاف المهام. ستصلك إشعارات عند وصول الطلبات.' : 'هذه المهمة لا تستقبل طلبات.',
    }));
}

// ---------- task editor (create, edit draft, publish) ----------
const DRAFT_KEY = 'mihmah:draft';
const EMPTY = { title: '', category: '', summary: '', scope: '', deliverables: '', skills: [], budget: '', durationDays: '', deadline: '', milestones: '' };
const STEPS = ['الأساسيات', 'النطاق والمخرجات', 'الميزانية والمراحل', 'المعاينة والحفظ'];
const FIELD_STEP = { title: 0, category: 0, summary: 0, scope: 1, deliverables: 1, skills: 1, budget: 2, durationDays: 2, deadline: 2, milestones: 2 };
let wizard = null;

function loadLocalDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (d?.data) return { taskId: null, step: d.step || 0, data: { ...EMPTY, ...d.data } };
  } catch { /* ignore */ }
  return { taskId: null, step: 0, data: { ...EMPTY } };
}
function saveLocalDraft() {
  if (wizard.taskId) return; // server-side drafts are saved explicitly
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: wizard.step, data: wizard.data })); } catch { /* convenience only */ }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function validateStep(step, d) {
  const e = {};
  if (step === 0) {
    if (d.title.trim().length < 10) e.title = 'العنوان قصير: 10 أحرف على الأقل.';
    else if (d.title.trim().length > 90) e.title = 'العنوان طويل: 90 حرفاً كحد أقصى.';
    if (!d.category) e.category = 'اختر فئة المهمة.';
    if (d.summary.trim().length < 30) e.summary = `النبذة قصيرة: ${d.summary.trim().length} من 30 حرفاً على الأقل.`;
  }
  if (step === 1) {
    if (d.scope.trim().length < 40) e.scope = `صف نطاق العمل بتفصيل أكثر (${d.scope.trim().length} من 40 حرفاً).`;
    const del = parseList(d.deliverables);
    if (!del.length) e.deliverables = 'أضف مُخرَجاً واحداً على الأقل، كل مُخرَج في سطر.';
    else if (del.length > 8) e.deliverables = '8 مخرجات كحد أقصى.';
    if (!d.skills.length) e.skills = 'أضف مهارة واحدة على الأقل.';
    else if (d.skills.length > 8) e.skills = '8 مهارات كحد أقصى.';
  }
  if (step === 2) {
    const budget = Number(d.budget);
    const days = Number(d.durationDays);
    if (!Number.isFinite(budget) || budget < 10 || budget > 2000) e.budget = 'أدخل ميزانية بين 10 و2000 دينار.';
    if (!Number.isInteger(days) || days < 1 || days > 60) e.durationDays = 'أدخل مدة بين 1 و60 يوماً.';
    if (!d.deadline) e.deadline = 'اختر موعد التسليم.';
    else if (!e.durationDays && daysUntil(`${d.deadline}T12:00:00+03:00`) < days) e.deadline = `يجب أن يتسع الموعد لمدة التنفيذ (${fmtDays(days)} على الأقل من اليوم).`;
    const ms = parseList(d.milestones);
    if (!ms.length) e.milestones = 'أضف مرحلة واحدة على الأقل، كل مرحلة في سطر.';
    else if (ms.length > 6) e.milestones = '6 مراحل كحد أقصى.';
  }
  return e;
}

const toPayload = (d, publish) => ({
  title: d.title.trim(), category: d.category, summary: d.summary.trim(), scope: d.scope.trim(),
  deliverables: parseList(d.deliverables), skills: d.skills, budget: Number(d.budget), durationDays: Number(d.durationDays),
  deadline: d.deadline, milestones: parseList(d.milestones), publish,
});

export async function publishWizard({ params }) {
  const editing = !!params.id;
  if (editing) {
    const t = await api.get(`/tasks/${params.id}`);
    if (!t.canEdit) {
      return h('div', { class: 'page' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'لا يمكن التعديل'),
        emptyState({ ico: 'alert', title: 'لا يمكن تعديل هذه المهمة', text: 'تُعدّل المسودات، أو المهام المنشورة قبل وصول أي طلب.', action: h('a', { class: 'btn btn-primary', href: `#/company/tasks/${t.id}` }, 'العودة') }));
    }
    if (!wizard || wizard.taskId !== t.id) {
      wizard = {
        taskId: t.id, status: t.status, step: 0,
        data: {
          title: t.title, category: t.category, summary: t.summary, scope: t.scope, deliverables: t.deliverables.join('\n'),
          skills: t.skills, budget: String(t.budget), durationDays: String(t.durationDays), deadline: ammanDate(t.deadlineAt), milestones: t.milestones.join('\n'),
        },
      };
    }
  } else if (!wizard || wizard.taskId) {
    wizard = loadLocalDraft();
  }
  const profile = await api.get('/me/profile');
  const container = h('div', { class: 'wizard' });

  const go = (step) => {
    wizard.step = step;
    saveLocalDraft();
    paint();
    container.querySelector('.wizard-step-title')?.focus();
  };

  async function save(publish, btn) {
    for (let s = 0; s < 3; s++) {
      if (Object.keys(validateStep(s, wizard.data)).length) { toast(`يرجى إكمال خطوة «${STEPS[s]}».`, 'error'); go(s); return; }
    }
    // Saving edits to an already-published task also sends publish=true; only a first publish is announced as one.
    const firstPublish = publish && wizard.status !== 'published';
    try {
      await busy(btn, firstPublish ? 'جارٍ النشر…' : 'جارٍ الحفظ…', async () => {
        const body = toPayload(wizard.data, publish);
        let id = wizard.taskId;
        if (id) {
          await api.patch(`/tasks/${id}`, body);
          if (publish && wizard.status === 'draft') await api.post(`/tasks/${id}/publish`);
        } else {
          id = (await api.post('/tasks', body)).id;
        }
        const wasEditing = !!wizard.taskId;
        wizard = null;
        clearDraft();
        toast(firstPublish ? 'نُشرت المهمة وتظهر الآن للطلاب في صفحة الاستكشاف.' : wasEditing ? 'حُفظت التعديلات.' : 'حُفظت المهمة كمسودة. لا يراها أحد غيرك.');
        navigate(publish ? `/company/tasks/${id}` : '/company/tasks?status=draft');
      });
    } catch (err) {
      if (err.fields) {
        const first = Object.keys(err.fields).sort((a, b) => (FIELD_STEP[a] ?? 9) - (FIELD_STEP[b] ?? 9))[0];
        go(FIELD_STEP[first] ?? 0);
        showErrors(container.querySelector('form'), err.fields);
      } else reportError(err);
    }
  }

  function paint() {
    const d = wizard.data;
    const stepper = h('ol', { class: 'stepper' }, STEPS.map((label, i) => {
      const state = i < wizard.step ? 'done' : i === wizard.step ? 'current' : 'todo';
      const inner = [h('span', { class: 'stepper-num' }, state === 'done' ? icon('check') : String(i + 1)), h('span', { class: 'stepper-label' }, label)];
      return h('li', { class: `stepper-item is-${state}`, 'aria-current': state === 'current' ? 'step' : null },
        state === 'done' ? h('button', { type: 'button', class: 'stepper-btn', onclick: () => go(i), 'aria-label': `العودة إلى خطوة ${label}` }, inner) : h('span', { class: 'stepper-btn' }, inner));
    }));

    let body;
    if (wizard.step === 0) {
      body = [
        field('عنوان المهمة', input({ name: 'title', value: d.title, maxlength: 90, placeholder: 'مثال: تصميم 8 منشورات لمقهى في عمّان' }), { hint: 'عنوان محدد يذكر المُخرَج الرئيسي (10–90 حرفاً).' }),
        field('الفئة', select({ name: 'category', value: d.category }, CATEGORIES.map((x) => [x.id, x.label]), 'اختر الفئة')),
        field('نبذة مختصرة', textarea({ name: 'summary', value: d.summary, rows: 3, maxlength: 300 }), { hint: 'تظهر على بطاقة المهمة (30–300 حرف).' }),
      ];
    } else if (wizard.step === 1) {
      body = [
        field('نطاق العمل', textarea({ name: 'scope', value: d.scope, rows: 5, maxlength: 2000 }), { hint: 'ما المطلوب بالضبط؟ ما الذي ستوفّره الشركة؟ كم جولة تعديل؟' }),
        field('المخرجات', textarea({ name: 'deliverables', value: d.deliverables, rows: 4, placeholder: 'ملف التصميم النهائي بصيغة PNG\nملف المصدر' }), { hint: 'كل مُخرَج في سطر مستقل (حتى 8).' }),
        skillsField('skills', d.skills, 'المهارات المطلوبة', 'افصل بينها بفاصلة أو اختر من الاقتراحات (حتى 8).'),
      ];
    } else if (wizard.step === 2) {
      body = [
        h('div', { class: 'form-grid' },
          field('الميزانية (دينار أردني)', input({ name: 'budget', type: 'number', min: 10, max: 2000, step: '0.001', inputmode: 'decimal', dir: 'ltr', value: d.budget }), { hint: 'مبلغ ثابت يراه الطالب قبل التقديم.' }),
          field('مدة التنفيذ (أيام)', input({ name: 'durationDays', type: 'number', min: 1, max: 60, inputmode: 'numeric', dir: 'ltr', value: d.durationDays })),
          field('موعد التسليم النهائي', input({ name: 'deadline', type: 'date', min: todayStr(1), dir: 'ltr', value: d.deadline }), { hint: 'نهاية اليوم بتوقيت عمّان.' })),
        field('المراحل', textarea({ name: 'milestones', value: d.milestones, rows: 4, placeholder: 'مسودة أولى\nالنسخة الكاملة\nالتعديلات والتسليم' }), { hint: 'من 1 إلى 6 مراحل، كل مرحلة في سطر. يمكن تعديلها لاحقاً داخل المشروع.' }),
        note('لا يُحجز أو يُحصَّل أي مبلغ عند النشر أو الاختيار: الدفع الإلكتروني بانتظار ربط مزوّد دفع يدعم الأردن.', 'shield'),
      ];
    } else {
      body = [preview(d, profile)];
    }

    const form = h('form', { class: 'stack', novalidate: true }, body);
    form.addEventListener('input', (e) => {
      const n = e.target.name;
      if (!n) return;
      d[n] = n === 'skills' ? parseSkills(e.target.value) : e.target.value;
      saveLocalDraft();
    });
    liveClear(form);
    const back = wizard.step > 0 && h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go(wizard.step - 1) }, icon('chevron-right'), 'السابق');
    let primary;
    if (wizard.step < 3) {
      primary = h('button', { type: 'submit', class: 'btn btn-primary' }, 'التالي', icon('chevron-left'));
    } else {
      const canPublish = session.user.emailVerified;
      const isPublished = wizard.status === 'published';
      const saveBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: (e) => save(isPublished, e.currentTarget) }, icon('file'), isPublished ? 'حفظ التعديلات' : 'حفظ كمسودة');
      const publishBtn = !isPublished && h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'publish-btn', disabled: !canPublish, onclick: (e) => save(true, e.currentTarget) }, icon('check'), 'نشر المهمة');
      primary = h('div', { class: 'btn-row' }, saveBtn, publishBtn);
      if (!canPublish && !isPublished) body.push(note('أكّد بريدك الإلكتروني لتتمكن من النشر. يمكنك حفظ المهمة كمسودة الآن.', 'alert'));
      form.replaceChildren(...body);
    }
    form.append(h('div', { class: 'wizard-actions' }, back || h('span'), primary));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (wizard.step < 3 && showErrors(form, validateStep(wizard.step, d))) go(wizard.step + 1);
    });

    container.replaceChildren(stepper,
      h('section', { class: 'panel wizard-panel', 'aria-labelledby': 'wizard-step-title' },
        h('h2', { class: 'wizard-step-title', id: 'wizard-step-title', tabindex: '-1' }, `الخطوة ${wizard.step + 1} من 4: ${STEPS[wizard.step]}`),
        form));
  }
  paint();

  const hasLocal = !editing && Object.values(wizard.data).some((v) => (Array.isArray(v) ? v.length : String(v).trim()));
  return h('div', { class: 'page narrow-wide' },
    pageHeader({
      eyebrow: profile.companyName, title: editing ? 'تعديل المهمة' : 'انشر مهمّة جديدة',
      subtitle: editing ? 'تُحفظ التعديلات على الخادم عند الضغط على «حفظ».' : 'أربع خطوات قصيرة. يُحفظ ما تكتبه مؤقتاً في هذا المتصفح حتى تحفظ المسودة أو تنشر.',
      actions: hasLocal && h('button', {
        type: 'button', class: 'btn btn-text', onclick: async () => {
          if (!await confirmDialog({ title: 'مسح النموذج؟', body: h('p', null, 'ستُمسح كل الحقول غير المحفوظة.'), confirmLabel: 'مسح', danger: true })) return;
          wizard = null;
          clearDraft();
          refresh();
          toast('مُسح النموذج.', 'info');
        },
      }, icon('x'), 'مسح النموذج'),
    }),
    container);
}

function preview(d, profile) {
  const cat = d.category && categoryOf(d.category);
  const edit = (step) => h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: () => { wizard.step = step; saveLocalDraft(); refresh(); } }, icon('edit'), 'تعديل');
  return h('div', { class: 'stack' },
    note('هكذا ستظهر المهمة للطلاب. تأكد من وضوح النطاق والمخرجات قبل النشر.', 'eye'),
    h('div', { class: 'preview-task card-raised' },
      h('div', { class: 'preview-row' }, h('div', null,
        cat && badge(cat.label, 'cat', cat.icon),
        h('h3', { class: 'preview-task-title' }, d.title || '—'),
        h('p', { class: 'muted small' }, [profile.companyName, profile.city].filter(Boolean).join(' · '))), edit(0)),
      h('p', { class: 'prose' }, d.summary),
      h('ul', { class: 'meta-row' },
        h('li', { class: 'inset-pill pill-accent' }, icon('wallet'), bdi(d.budget ? fmtJOD(d.budget) : '—')),
        h('li', { class: 'inset-pill' }, icon('clock'), d.durationDays ? fmtDays(d.durationDays) : '—'),
        h('li', { class: 'inset-pill' }, icon('calendar'), d.deadline ? fmtDate(`${d.deadline}T12:00:00+03:00`) : '—'))),
    h('div', { class: 'preview-section' }, h('div', { class: 'preview-row' }, h('h3', { class: 'sub-title' }, 'نطاق العمل'), edit(1)), h('p', { class: 'prose' }, d.scope)),
    h('div', { class: 'preview-section' }, h('h3', { class: 'sub-title' }, 'المخرجات'),
      h('ul', { class: 'check-list' }, parseList(d.deliverables).map((x) => h('li', null, icon('check'), h('span', null, x))))),
    h('div', { class: 'preview-section' }, h('h3', { class: 'sub-title' }, 'المهارات'), skillChips(d.skills)),
    h('div', { class: 'preview-section' }, h('div', { class: 'preview-row' }, h('h3', { class: 'sub-title' }, 'المراحل'), edit(2)),
      h('ol', { class: 'milestone-list' }, parseList(d.milestones).map((m, i) => h('li', null, h('span', { class: 'ms-num' }, String(i + 1)), h('span', null, m))))));
}
