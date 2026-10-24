import { h, bdi, fmtJOD, fmtDate, fmtDays, fmtRelative, todayStr, daysUntil, parseList } from '../dom.js';
import { icon } from '../icons.js';
import { CATEGORIES, APPLICATION_STATUS, TASK_STATUS } from '../data.js';
import {
  pageHeader, section, stat, emptyState, statusBadge, badge, demoBadge, skillChips, field, input, textarea, select,
  showErrors, liveClear, busy, toast, reportError, note, extLink, confirmDialog, avatar,
} from '../ui.js';
import { navigate } from '../router.js';
import { switchTo } from '../shell.js';
import { skillsField, parseSkills } from './entry.js';
import { categoryOf, deadlineText, projectRow, notificationRow } from './student.js';
import * as store from '../store.js';

const ACTIVE = ['in_progress', 'review', 'revision'];

// ---------- dashboard ----------
export function companyDashboard() {
  const c = store.currentCompany();
  const tasks = store.companyTasks(c.id);
  const projects = store.companyProjects(c.id);
  const openTasks = tasks.filter((t) => t.status === 'open');
  const pendingApps = openTasks.flatMap((t) => store.applicationsForTask(t.id)).filter((a) => a.status === 'pending');
  const active = projects.filter((p) => ACTIVE.includes(p.status));
  const awaiting = projects.filter((p) => p.status === 'review');
  const notes = store.myNotifications().slice(0, 5);

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: c.name, title: `أهلاً، ${c.contactName.split(' ')[0]}`, subtitle: 'كل الأرقام هنا محسوبة من سجلات المهام والطلبات والمشاريع نفسها.',
      actions: h('a', { class: 'btn btn-primary', href: '#/company/publish' }, icon('plus'), 'انشر مهمّة'),
    }),
    h('div', { class: 'stats' },
      stat('مهام منشورة', tasks.length, 'briefcase', '/company/tasks'),
      stat('متقدّمون بانتظار قرارك', pendingApps.length, 'users', '/company/tasks'),
      stat('مشاريع نشطة', active.length, 'folder', '/projects'),
      stat('أعمال بانتظار المراجعة', awaiting.length, 'eye', '/projects')),
    h('div', { class: 'dash-grid' },
      section('بانتظار مراجعتك', awaiting.length
        ? h('ul', { class: 'rows' }, awaiting.map(projectRow))
        : emptyState({ ico: 'eye', title: 'لا توجد أعمال بانتظار المراجعة', text: 'عندما يسلّم طالب عمله يظهر هنا.' }),
      { ico: 'eye' }),
      section('مهامك المنشورة', tasks.length
        ? h('ul', { class: 'rows' }, tasks.slice(0, 6).map(taskRow))
        : emptyState({ ico: 'briefcase', title: 'لم تنشر أي مهمة بعد', action: h('a', { class: 'btn btn-primary btn-sm', href: '#/company/publish' }, 'انشر أول مهمة') }),
      { ico: 'briefcase', action: h('a', { class: 'link', href: '#/company/tasks' }, 'كل المهام') }),
      section('المشاريع النشطة', active.length
        ? h('ul', { class: 'rows' }, active.map(projectRow))
        : emptyState({ ico: 'folder', title: 'لا توجد مشاريع نشطة', text: 'اختر متقدّماً لإحدى مهامك لبدء مشروع.' }),
      { ico: 'folder' }),
      section('الإشعارات', notes.length
        ? h('ul', { class: 'rows' }, notes.map(notificationRow))
        : emptyState({ ico: 'bell', title: 'لا إشعارات بعد', text: 'تظهر هنا الطلبات الجديدة والتسليمات والرسائل.' }),
      { ico: 'bell', action: notes.length ? h('a', { class: 'link', href: '#/notifications' }, 'عرض الكل') : null })));
}

function taskRow(t) {
  const apps = store.applicationsForTask(t.id);
  const pending = apps.filter((a) => a.status === 'pending').length;
  const p = store.projectForTask(t.id);
  return h('li', null, h('a', { class: 'row-link', href: p ? `#/projects/${p.id}` : `#/company/tasks/${t.id}` },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t.title),
      h('span', { class: 'row-sub' }, `${apps.length} متقدّم${pending ? ` · ${pending} بانتظار القرار` : ''}`)),
    statusBadge(TASK_STATUS, t.status)));
}

// ---------- task list ----------
export function companyTasks() {
  const c = store.currentCompany();
  const tasks = store.companyTasks(c.id);
  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: c.name, title: 'مهامي المنشورة', subtitle: 'راجع المتقدّمين لكل مهمة مفتوحة أو افتح مشروعها الجاري.',
      actions: h('a', { class: 'btn btn-primary', href: '#/company/publish' }, icon('plus'), 'انشر مهمّة'),
    }),
    tasks.length ? h('ul', { class: 'app-list' }, tasks.map((t) => {
      const apps = store.applicationsForTask(t.id);
      const p = store.projectForTask(t.id);
      return h('li', { class: 'app-item card-raised' },
        h('div', { class: 'app-main' },
          h('p', null, badge(categoryOf(t.category).label, 'cat', categoryOf(t.category).icon), ' ', t.demo && demoBadge()),
          h('h2', { class: 'app-title' }, h('a', { href: `#/company/tasks/${t.id}` }, t.title)),
          h('p', { class: 'muted small' }, bdi(fmtJOD(t.budget)), ` · ${fmtDays(t.durationDays)} · نُشرت ${fmtRelative(t.createdAt)}`)),
        h('div', { class: 'app-side' },
          statusBadge(TASK_STATUS, t.status),
          h('span', { class: 'count-pill' }, icon('users'), `${apps.length} متقدّم`),
          p ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/projects/${p.id}` }, 'فتح المشروع')
            : h('a', { class: 'btn btn-primary btn-sm', href: `#/company/tasks/${t.id}` }, 'مراجعة المتقدّمين')));
    })) : emptyState({ ico: 'briefcase', title: 'لا توجد مهام منشورة', text: 'ابدأ بنشر مهمة قصيرة بنطاق واضح.', action: h('a', { class: 'btn btn-primary', href: '#/company/publish' }, 'انشر مهمّة') }));
}

// ---------- applicant review ----------
export function applicants({ params }) {
  const t = store.taskById(params.id);
  const c = store.currentCompany();
  if (!t) return null;
  if (t.companyId !== c.id) {
    return h('div', { class: 'page' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'مهمة غير متاحة'),
      emptyState({ ico: 'alert', title: 'هذه المهمة ليست ضمن مهام شركتك', action: h('a', { class: 'btn btn-primary', href: '#/company/tasks' }, 'العودة إلى مهامي') }));
  }
  const apps = store.applicationsForTask(t.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const project = store.projectForTask(t.id);
  const wanted = new Set(t.skills.map((s) => s.toLowerCase()));

  const card = (a) => {
    const s = store.studentById(a.studentId);
    const matches = s.skills.filter((x) => wanted.has(x.toLowerCase()));
    const selectBtn = t.status === 'open' && a.status === 'pending' && h('button', {
      type: 'button', class: 'btn btn-primary', id: `select-${a.id}`,
      onclick: async (e) => {
        const btn = e.currentTarget; // currentTarget is null after the await below
        const others = apps.length - 1;
        const ok = await confirmDialog({
          title: `اختيار ${s.name}؟`,
          body: h('div', { class: 'stack-sm' },
            h('p', null, `سيُنشأ مشروع مشترك لمهمة «${t.title}» وتتحول حالة الطلب إلى «تم اختيارك».`),
            others > 0 && h('p', null, `سيُبلَّغ بقية المتقدّمين (${others}) بعدم اختيارهم وستتوقف المهمة عن استقبال الطلبات.`),
            note('لا يمكن التراجع عن الاختيار في هذا النموذج الأولي.', 'alert')),
          confirmLabel: 'تأكيد الاختيار',
        });
        if (!ok) return;
        try {
          const p = await busy(btn, 'جارٍ إنشاء المشروع…', () => store.selectApplicant(a.id));
          toast(`تم اختيار ${s.name} وإنشاء المشروع.`);
          navigate(`/projects/${p.id}`);
        } catch (err) { reportError(err); }
      },
    }, icon('check'), 'اختيار هذا الطالب');

    return h('li', { class: `applicant card-raised${a.status === 'accepted' ? ' is-selected' : ''}` },
      h('div', { class: 'applicant-head' },
        avatar(s.name, 'avatar-lg'),
        h('div', { class: 'applicant-who' },
          h('h2', { class: 'applicant-name' }, s.name, ' ', s.demo && demoBadge()),
          h('p', { class: 'muted small' }, `${s.major} · ${s.university}`)),
        statusBadge(APPLICATION_STATUS, a.status)),
      h('div', { class: 'applicant-body' },
        h('p', { class: 'small muted' }, `المهارات المطابقة: ${matches.length} من ${t.skills.length}`),
        skillChips(s.skills, wanted),
        h('h3', { class: 'sub-title' }, 'العرض'),
        h('p', { class: 'prose quote' }, a.proposal),
        h('ul', { class: 'meta-row' },
          h('li', { class: 'inset-pill' }, icon('clock'), `التسليم خلال ${fmtDays(a.deliveryDays)}`),
          h('li', { class: 'inset-pill' }, icon('history'), `تقدّم ${fmtRelative(a.createdAt)}`))),
      h('div', { class: 'applicant-foot' },
        a.portfolioUrl ? extLink(a.portfolioUrl, 'ملف الأعمال') : h('span', { class: 'muted small' }, 'لم يُرفق رابط أعمال'),
        h('a', { class: 'btn btn-ghost', href: `#/portfolio/${s.id}` }, icon('user'), 'الملف الكامل'),
        selectBtn));
  };

  return h('div', { class: 'page' },
    h('a', { class: 'back-link', href: '#/company/tasks' }, icon('chevron-right'), 'مهامي المنشورة'),
    pageHeader({
      eyebrow: 'مراجعة المتقدّمين', title: t.title,
      subtitle: h('span', { class: 'inline-meta' }, statusBadge(TASK_STATUS, t.status), bdi(fmtJOD(t.budget)), ` · ${fmtDays(t.durationDays)} · ${deadlineText(t.deadline)}`),
    }),
    project && note(`تم اختيار ${store.studentById(project.studentId).name} لهذه المهمة.`, 'check'),
    project && h('p', null, h('a', { class: 'btn btn-primary', href: `#/projects/${project.id}` }, icon('folder'), 'فتح مساحة المشروع')),
    h('h2', { class: 'section-label' }, `المتقدّمون (${apps.length})`),
    apps.length ? h('ul', { class: 'applicants' }, apps.map(card)) : emptyState({
      ico: 'users', title: 'لا يوجد متقدّمون بعد',
      text: 'المهمة ظاهرة الآن في صفحة استكشاف المهام. لتجربة الرحلة كاملة، بدّل إلى وضع الطالب وتقدّم لها.',
      action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => switchTo('student', `/tasks/${t.id}`) }, icon('switch'), 'التبديل إلى الطالب وفتح المهمة'),
    }));
}

// ---------- publish wizard ----------
const DRAFT_KEY = 'mihmah:draft';
const EMPTY = { title: '', category: '', summary: '', scope: '', deliverables: '', skills: [], budget: '', durationDays: '', deadline: '', milestones: '' };
const STEPS = ['الأساسيات', 'النطاق والمخرجات', 'الميزانية والمراحل', 'المعاينة والنشر'];
let wizard = loadDraft();

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (d && d.data) return { step: d.step || 0, data: { ...EMPTY, ...d.data } };
  } catch { /* ignore */ }
  return { step: 0, data: { ...EMPTY } };
}
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(wizard)); } catch { /* draft is a convenience */ }
}
export function clearDraft() {
  wizard = { step: 0, data: { ...EMPTY } };
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function validateStep(step, d) {
  const e = {};
  if (step === 0) {
    if (d.title.trim().length < 10) e.title = 'العنوان قصير: اكتب 10 أحرف على الأقل يصف المهمة بوضوح.';
    else if (d.title.trim().length > 90) e.title = 'العنوان طويل: 90 حرفاً كحد أقصى.';
    if (!d.category) e.category = 'اختر فئة المهمة.';
    if (d.summary.trim().length < 30) e.summary = `النبذة قصيرة: ${d.summary.trim().length} من 30 حرفاً على الأقل.`;
  }
  if (step === 1) {
    if (d.scope.trim().length < 40) e.scope = `صف نطاق العمل بتفصيل أكثر (${d.scope.trim().length} من 40 حرفاً على الأقل).`;
    const del = parseList(d.deliverables);
    if (!del.length) e.deliverables = 'أضف مُخرَجاً واحداً على الأقل، كل مُخرَج في سطر.';
    else if (del.length > 8) e.deliverables = '8 مخرجات كحد أقصى؛ قسّم المهمة إن كانت أكبر.';
    if (!d.skills.length) e.skills = 'أضف مهارة واحدة على الأقل.';
  }
  if (step === 2) {
    const budget = Number(d.budget);
    const days = Number(d.durationDays);
    if (!Number.isInteger(budget) || budget < 10 || budget > 2000) e.budget = 'أدخل ميزانية بين 10 و2000 دينار (رقم صحيح).';
    if (!Number.isInteger(days) || days < 1 || days > 60) e.durationDays = 'أدخل مدة بين 1 و60 يوماً.';
    if (!d.deadline) e.deadline = 'اختر موعد التسليم.';
    else if (daysUntil(d.deadline) < 1) e.deadline = 'يجب أن يكون موعد التسليم بعد اليوم.';
    else if (!e.durationDays && daysUntil(d.deadline) < days) e.deadline = `الموعد قريب جداً: يجب أن يتسع لمدة التنفيذ (${fmtDays(days)}).`;
    const ms = parseList(d.milestones);
    if (!ms.length) e.milestones = 'أضف مرحلة واحدة على الأقل، كل مرحلة في سطر.';
    else if (ms.length > 6) e.milestones = '6 مراحل كحد أقصى.';
  }
  return e;
}

export function publishWizard() {
  const c = store.currentCompany();
  const container = h('div', { class: 'wizard' });

  const go = (step) => {
    wizard.step = step;
    saveDraft();
    paint();
    container.querySelector('.wizard-step-title')?.focus();
  };

  function paint() {
    const d = wizard.data;
    const stepper = h('ol', { class: 'stepper' }, STEPS.map((label, i) => {
      const state = i < wizard.step ? 'done' : i === wizard.step ? 'current' : 'todo';
      const inner = [h('span', { class: 'stepper-num' }, state === 'done' ? icon('check') : String(i + 1)), h('span', { class: 'stepper-label' }, label)];
      return h('li', { class: `stepper-item is-${state}`, 'aria-current': state === 'current' ? 'step' : null },
        state === 'done' ? h('button', { type: 'button', class: 'stepper-btn', onclick: () => go(i), 'aria-label': `العودة إلى خطوة ${label}` }, inner) : h('span', { class: 'stepper-btn' }, inner));
    }));

    const bind = (el) => {
      el.addEventListener('input', (e) => {
        const n = e.target.name;
        if (!n) return;
        d[n] = n === 'skills' ? parseSkills(e.target.value) : e.target.value;
        saveDraft();
      });
      liveClear(el);
      return el;
    };

    let body;
    if (wizard.step === 0) {
      body = [
        field('عنوان المهمة', input({ name: 'title', value: d.title, maxlength: 90, placeholder: 'مثال: تصميم 8 منشورات لمقهى في عمّان' }), { hint: 'عنوان محدد يذكر المُخرَج الرئيسي.' }),
        field('الفئة', select({ name: 'category', value: d.category }, CATEGORIES.map((x) => [x.id, x.label]), 'اختر الفئة')),
        field('نبذة مختصرة', textarea({ name: 'summary', value: d.summary, rows: 3, maxlength: 300 }), { hint: 'جملة أو جملتان تظهران على بطاقة المهمة (30–300 حرف).' }),
      ];
    } else if (wizard.step === 1) {
      body = [
        field('نطاق العمل', textarea({ name: 'scope', value: d.scope, rows: 5, maxlength: 1200 }), { hint: 'ما المطلوب بالضبط؟ ما الذي ستوفّره الشركة؟ كم جولة تعديل؟' }),
        field('المخرجات', textarea({ name: 'deliverables', value: d.deliverables, rows: 4, placeholder: 'ملف التصميم النهائي بصيغة PNG\nملف المصدر' }), { hint: 'كل مُخرَج في سطر مستقل.' }),
        skillsField('skills', d.skills, 'المهارات المطلوبة', 'افصل بينها بفاصلة أو اختر من الاقتراحات.'),
      ];
    } else if (wizard.step === 2) {
      body = [
        h('div', { class: 'form-grid' },
          field('الميزانية (دينار أردني)', input({ name: 'budget', type: 'number', min: 10, max: 2000, step: 1, inputmode: 'numeric', dir: 'ltr', value: d.budget }), { hint: 'مبلغ ثابت يراه الطالب قبل التقديم. لا يتم أي دفع حقيقي في النموذج.' }),
          field('مدة التنفيذ (أيام)', input({ name: 'durationDays', type: 'number', min: 1, max: 60, inputmode: 'numeric', dir: 'ltr', value: d.durationDays })),
          field('موعد التسليم النهائي', input({ name: 'deadline', type: 'date', min: todayStr(1), dir: 'ltr', value: d.deadline }))),
        field('المراحل', textarea({ name: 'milestones', value: d.milestones, rows: 4, placeholder: 'مسودة أولى\nالنسخة الكاملة\nالتعديلات والتسليم' }), { hint: 'من 1 إلى 6 مراحل، كل مرحلة في سطر.' }),
      ];
    } else {
      body = [preview(d, c)];
    }

    const form = bind(h('form', { class: 'stack', novalidate: true }, body));
    const back = wizard.step > 0 && h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go(wizard.step - 1) }, icon('chevron-right'), 'السابق');
    const nextBtn = wizard.step < 3
      ? h('button', { type: 'submit', class: 'btn btn-primary' }, 'التالي', icon('chevron-left'))
      : h('button', { type: 'submit', class: 'btn btn-primary btn-lg', id: 'publish-btn' }, icon('check'), 'نشر المهمة');
    form.append(h('div', { class: 'wizard-actions' }, back || h('span'), nextBtn));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (wizard.step < 3) {
        if (showErrors(form, validateStep(wizard.step, d))) go(wizard.step + 1);
        return;
      }
      for (let s = 0; s < 3; s++) {
        if (Object.keys(validateStep(s, d)).length) { toast(`يرجى إكمال خطوة «${STEPS[s]}».`, 'error'); go(s); return; }
      }
      try {
        const t = await busy(nextBtn, 'جارٍ النشر…', () => store.publishTask({
          title: d.title.trim(), category: d.category, summary: d.summary.trim(), scope: d.scope.trim(),
          deliverables: parseList(d.deliverables), skills: d.skills, budget: Number(d.budget),
          durationDays: Number(d.durationDays), deadline: d.deadline, milestones: parseList(d.milestones),
        }));
        clearDraft();
        toast('نُشرت المهمة وتظهر الآن في صفحة استكشاف المهام للطلاب.');
        navigate(`/company/tasks/${t.id}`);
      } catch (err) { reportError(err); }
    });

    container.replaceChildren(stepper,
      h('section', { class: 'panel wizard-panel', 'aria-labelledby': 'wizard-step-title' },
        h('h2', { class: 'wizard-step-title', id: 'wizard-step-title', tabindex: '-1' }, `الخطوة ${wizard.step + 1} من 4: ${STEPS[wizard.step]}`),
        form));
  }
  paint();

  const hasDraft = Object.values(wizard.data).some((v) => (Array.isArray(v) ? v.length : String(v).trim()));
  return h('div', { class: 'page narrow-wide' },
    pageHeader({
      eyebrow: c.name, title: 'انشر مهمّة جديدة', subtitle: 'أربع خطوات قصيرة. تُحفظ مسودتك تلقائياً في هذا المتصفح.',
      actions: hasDraft && h('button', {
        type: 'button', class: 'btn btn-text', onclick: async () => {
          if (await confirmDialog({ title: 'حذف المسودة؟', body: h('p', null, 'ستُمسح كل الحقول وتعود إلى الخطوة الأولى.'), confirmLabel: 'حذف المسودة', danger: true })) {
            clearDraft();
            navigate('/company/publish');
            toast('حُذفت المسودة.', 'info');
          }
        },
      }, icon('x'), 'حذف المسودة'),
    }),
    container);
}

function preview(d, c) {
  const cat = categoryOf(d.category);
  const edit = (step) => h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: () => { wizard.step = step; saveDraft(); navigate('/company/publish'); } }, icon('edit'), 'تعديل');
  return h('div', { class: 'stack' },
    note('هكذا ستظهر المهمة للطلاب. تأكد من وضوح النطاق والمخرجات قبل النشر.', 'eye'),
    h('div', { class: 'preview-task card-raised' },
      h('div', { class: 'preview-row' }, h('div', null,
        cat && badge(cat.label, 'cat', cat.icon),
        h('h3', { class: 'preview-task-title' }, d.title || '—'),
        h('p', { class: 'muted small' }, `${c.name} · ${c.city}`)), edit(0)),
      h('p', { class: 'prose' }, d.summary),
      h('ul', { class: 'meta-row' },
        h('li', { class: 'inset-pill pill-accent' }, icon('wallet'), bdi(d.budget ? fmtJOD(d.budget) : '—')),
        h('li', { class: 'inset-pill' }, icon('clock'), d.durationDays ? fmtDays(d.durationDays) : '—'),
        h('li', { class: 'inset-pill' }, icon('calendar'), d.deadline ? fmtDate(d.deadline) : '—'))),
    h('div', { class: 'preview-section' }, h('div', { class: 'preview-row' }, h('h3', { class: 'sub-title' }, 'نطاق العمل'), edit(1)), h('p', { class: 'prose' }, d.scope)),
    h('div', { class: 'preview-section' }, h('h3', { class: 'sub-title' }, 'المخرجات'),
      h('ul', { class: 'check-list' }, parseList(d.deliverables).map((x) => h('li', null, icon('check'), h('span', null, x))))),
    h('div', { class: 'preview-section' }, h('h3', { class: 'sub-title' }, 'المهارات'), skillChips(d.skills)),
    h('div', { class: 'preview-section' }, h('div', { class: 'preview-row' }, h('h3', { class: 'sub-title' }, 'المراحل'), edit(2)),
      h('ol', { class: 'milestone-list' }, parseList(d.milestones).map((m, i) => h('li', null, h('span', { class: 'ms-num' }, String(i + 1)), h('span', null, m))))),
    note('الميزانية للعرض فقط: لا يتم حجز أو تحويل أي مبلغ في هذا النموذج الأولي.', 'shield'));
}

