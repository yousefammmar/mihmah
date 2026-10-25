// Projects list, shared workspace (milestones, messages, files, deliverables, review) and printable summary.
import { h, bdi, fmtJOD, fmtDate, fmtDateTime, fmtDays, fmtRelative, isUrl, parseList, fmtSize, todayStr } from '../dom.js';
import { icon } from '../icons.js';
import { PROJECT_STATUS, ALLOWED_FILES, categoryOf } from '../data.js';
import {
  pageHeader, section, emptyState, statusBadge, skillChips, field, input, textarea, showErrors, serverErrors, liveClear,
  busy, toast, reportError, note, extLink, formDialog, openDialog, stars, avatar, confirmDialog, verifiedBadge,
} from '../ui.js';
import { api, session } from '../api.js';
import { refresh } from '../router.js';
import { onLive } from '../live.js';
import { brand } from '../shell.js';
import { projectRow, paymentPanel, deadlineText } from './common.js';
import { reportDialog } from './student.js';

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = ALLOWED_FILES.split(',').map((e) => e.slice(1));

// ---------- list ----------
export async function projectsList() {
  const { items } = await api.get('/projects');
  const active = items.filter((p) => !['completed', 'cancelled'].includes(p.status));
  const done = items.filter((p) => ['completed', 'cancelled'].includes(p.status));
  const isStudent = session.user.role === 'student';
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: isStudent ? 'مشاريعي' : 'المشاريع', title: 'المشاريع', subtitle: 'يبدأ المشروع عندما يقبل الطالب عرض الشركة، وينتهي عند اعتماد الإنجاز.' }),
    items.length ? h('div', { class: 'dash-grid' },
      section(`جارية (${active.length})`, active.length ? h('ul', { class: 'rows' }, active.map(projectRow)) : emptyState({ ico: 'folder', title: 'لا توجد مشاريع جارية' }), { ico: 'folder' }),
      section(`منتهية (${done.length})`, done.length ? h('ul', { class: 'rows' }, done.map(projectRow)) : emptyState({ ico: 'award', title: 'لا توجد مشاريع منتهية بعد' }), { ico: 'award' }))
      : emptyState({
        ico: 'folder', title: 'لا توجد مشاريع بعد',
        text: isStudent ? 'تقدّم لمهمة، وعندما تقبل عرض الشركة يبدأ المشروع هنا.' : 'أرسل عرضاً لأحد المتقدّمين؛ يبدأ المشروع عند قبوله.',
        action: h('a', { class: 'btn btn-primary', href: isStudent ? '#/tasks' : '#/company/tasks' }, isStudent ? 'استكشف المهام' : 'مهامي'),
      }));
}

// ---------- uploads ----------
let uploaderSeq = 0;
function uploader(projectId, { label = 'إرفاق ملفات', max = 5 } = {}) {
  const id = `up-${++uploaderSeq}`;
  const items = [];
  const list = h('ul', { class: 'file-list', 'aria-live': 'polite' });
  const fileInput = h('input', { type: 'file', id, class: 'file-input', multiple: true, accept: ALLOWED_FILES, 'aria-label': label });
  const pick = h('label', { for: id, class: 'btn btn-ghost btn-sm file-pick', 'aria-hidden': 'true' }, icon('paperclip'), label);

  const start = (item) => {
    item.status = 'uploading';
    item.progress = 0;
    paint();
    api.upload(`/projects/${projectId}/attachments`, item.file, (p) => { item.progress = p; paintRow(item); })
      .then((res) => { item.status = 'done'; item.id = res.id; paint(); })
      .catch((err) => { item.status = 'error'; item.error = err.message; paint(); });
  };

  function paintRow(item) {
    if (!item.row) return;
    const bar = item.row.querySelector('.progress');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(Math.round(item.progress * 100)));
      bar.firstChild.style.width = `${Math.round(item.progress * 100)}%`;
    }
  }

  function paint() {
    list.replaceChildren(...items.map((item) => {
      const remove = h('button', { type: 'button', class: 'btn btn-text btn-sm', 'aria-label': `إزالة ${item.file.name}`, onclick: () => { items.splice(items.indexOf(item), 1); paint(); } }, icon('x'));
      item.row = h('li', { class: `upload upload-${item.status}` },
        h('span', { class: 'file-thumb file-thumb-icon' }, icon(item.file.type.startsWith('image/') ? 'image' : 'file')),
        h('span', { class: 'upload-main' },
          h('span', { class: 'file-name' }, bdi(item.file.name)),
          item.status === 'uploading' && h('span', { class: 'progress', role: 'progressbar', 'aria-label': `رفع ${item.file.name}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, h('span', { class: 'progress-bar', style: 'width:0%' })),
          item.status === 'done' && h('span', { class: 'muted small' }, `تم الرفع · ${fmtSize(item.file.size)}`),
          item.status === 'error' && h('span', { class: 'field-error' }, item.error)),
        item.status === 'error' && h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: () => start(item) }, icon('refresh'), 'إعادة المحاولة'),
        item.status !== 'uploading' && remove);
      paintRow(item);
      return item.row;
    }));
  }

  fileInput.addEventListener('change', () => {
    for (const file of fileInput.files) {
      if (items.length >= max) { toast(`الحد الأقصى ${max} ملفات.`, 'error'); break; }
      const ext = file.name.split('.').pop().toLowerCase();
      const item = { file, status: 'error', progress: 0 };
      items.push(item);
      if (!EXTENSIONS.includes(ext)) item.error = 'نوع الملف غير مسموح.';
      else if (file.size > MAX_BYTES) item.error = 'الملف أكبر من 10 ميغابايت.';
      else { start(item); continue; }
    }
    fileInput.value = '';
    paint();
  });

  return {
    el: h('div', { class: 'file-drop' }, fileInput, pick, list, h('p', { class: 'field-hint' }, `صور، PDF، Office، ZIP، CSV — حتى 10 ميغابايت لكل ملف. الملفات خاصة بطرفي المشروع.`)),
    ids: () => items.filter((i) => i.status === 'done').map((i) => i.id),
    pending: () => items.some((i) => i.status === 'uploading'),
    failed: () => items.some((i) => i.status === 'error'),
  };
}

async function openAttachment(a) {
  try {
    const link = await api.post(`/attachments/${a.id}/link`);
    if (a.mimeType.startsWith('image/')) {
      openDialog({ title: a.name, wide: true, body: h('div', { class: 'dialog-body stack-sm' },
        h('img', { src: link.url, alt: `معاينة ${a.name}`, class: 'preview-img' }),
        h('a', { class: 'btn btn-ghost', href: link.url, download: a.name }, icon('upload'), 'تنزيل الملف')) });
    } else {
      const el = h('a', { href: link.url, download: a.name, hidden: true });
      document.body.append(el);
      el.click();
      el.remove();
    }
  } catch (err) { reportError(err); }
}

const attachmentList = (list) => list.length > 0 && h('ul', { class: 'attach-list' }, list.map((a) => h('li', null,
  h('button', { type: 'button', class: 'attach', onclick: () => openAttachment(a), 'aria-label': `${a.mimeType.startsWith('image/') ? 'معاينة' : 'تنزيل'} ${a.name}` },
    h('span', { class: 'file-thumb file-thumb-icon' }, icon(a.mimeType.startsWith('image/') ? 'image' : 'file')),
    h('span', { class: 'file-name' }, bdi(a.name)), h('span', { class: 'muted small' }, fmtSize(a.size))))));

// ---------- workspace ----------
const ACTIVITY = {
  'offer.created': () => 'أرسلت الشركة العرض',
  'offer.accepted': () => 'قبل الطالب العرض',
  'project.created': () => 'بدأ المشروع',
  'milestone.created': () => 'أضافت الشركة مرحلة جديدة',
  'milestone.done': () => 'أُنجزت مرحلة',
  'milestone.reopened': () => 'أُعيد فتح مرحلة',
  'milestone.deleted': () => 'حُذفت مرحلة',
  'deliverable.submitted': (a) => `سلّم الطالب الجولة ${a.round}`,
  'deliverable.revision_requested': (a) => `طلبت الشركة تعديلات على الجولة ${a.round}`,
  'project.completed': () => 'اعتمدت الشركة الإنجاز',
  'review.created': () => 'قيّم الطالب تجربته مع الشركة',
  'admin.cancel_project': () => 'ألغت الإدارة المشروع',
};

export async function workspace({ params }) {
  const [p, msgs, act] = await Promise.all([
    api.get(`/projects/${params.id}`), api.get(`/projects/${params.id}/messages`), api.get(`/projects/${params.id}/activity`),
  ]);
  const me = p.viewerRole;
  const updates = h('div', { class: 'live-banner', hidden: true, role: 'status' },
    icon('refresh'), 'حدّث الطرف الآخر المشروع.', h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: () => refresh() }, 'عرض التحديث'));
  const messages = messagesPanel(p, msgs);

  // Refresh immediately unless the user is in the middle of writing something.
  onLive('project', (d) => {
    if (d.id !== p.id) return;
    const typing = [...document.querySelectorAll('.workspace-grid textarea, .workspace-grid input[type=url]')].some((el) => el.value.trim());
    if (typing) updates.hidden = false; else refresh();
  });
  onLive('message', (d) => { if (d.projectId === p.id) messages.reload(); });

  return h('div', { class: 'page' },
    h('a', { class: 'back-link', href: me === 'admin' ? '#/admin/projects' : '#/projects' }, icon('chevron-right'), 'المشاريع'),
    pageHeader({
      eyebrow: 'مساحة المشروع', title: p.task.title,
      subtitle: h('span', { class: 'inline-meta' }, icon('graduation'), p.student.fullName, h('span', { class: 'muted' }, '⇄'), icon('building'), p.company.companyName, p.company.verified && verifiedBadge()),
      actions: [statusBadge(PROJECT_STATUS, p.status), p.actions.report && h('button', { type: 'button', class: 'btn btn-text', onclick: () => reportDialog('project', p.id) }, icon('alert'), 'الإبلاغ عن نزاع')],
    }),
    updates,
    statusTrack(p),
    me === 'admin' && note('تعرض هذا المشروع بصفتك مسؤولاً للتحقق من نزاع. يُسجَّل اطلاعك في سجل التدقيق.', 'shield'),
    h('div', { class: 'workspace-grid' },
      h('div', { class: 'stack' },
        actionPanel(p),
        milestonesPanel(p),
        deliverablesPanel(p),
        briefPanel(p)),
      h('div', { class: 'stack' },
        section('الدفع', paymentPanel(p.payment), { ico: 'wallet' }),
        messages.el,
        section('سجل النشاط', act.items.length ? h('ol', { class: 'timeline' }, act.items.map((a) => h('li', null,
          h('span', { class: 'timeline-dot', 'aria-hidden': 'true' }),
          h('span', null, (ACTIVITY[a.action] || (() => a.action))(a)),
          h('time', { datetime: a.createdAt, class: 'muted small' }, fmtDateTime(a.createdAt)))))
          : h('p', { class: 'muted small' }, 'لا يوجد نشاط بعد.'), { ico: 'history' }))));
}

function statusTrack(p) {
  const steps = [['in_progress', 'قيد التنفيذ'], ['awaiting_review', 'بانتظار المراجعة'], ['completed', 'مكتملة']];
  const order = { in_progress: 0, revision_requested: 0, awaiting_review: 1, completed: 2, cancelled: -1 };
  const cur = order[p.status];
  if (cur < 0) return note(`أُلغي هذا المشروع: ${p.cancelReason || ''}`, 'alert');
  return h('ol', { class: 'status-track', 'aria-label': 'مراحل حالة المشروع' },
    steps.map(([, label], i) => h('li', { class: `track-item${i < cur ? ' is-done' : ''}${i === cur ? ' is-current' : ''}`, 'aria-current': i === cur ? 'step' : null },
      h('span', { class: 'track-dot' }, i < cur ? icon('check') : String(i + 1)),
      h('span', null, i === 0 && p.status === 'revision_requested' ? 'مطلوب تعديل' : label))));
}

function actionPanel(p) {
  const me = p.viewerRole;
  const last = p.deliverables.at(-1);
  if (p.status === 'completed') {
    const fromCompany = p.reviews.find((r) => r.reviewerRole === 'company');
    return section('اكتمل المشروع', h('div', { class: 'stack-sm' },
      h('p', null, `اعتمدت ${p.company.companyName} الإنجاز في ${fmtDate(p.completedAt)}.`),
      fromCompany && h('div', { class: 'feedback' }, stars(fromCompany.rating), h('p', { class: 'prose quote' }, fromCompany.comment)),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn-primary', href: `#/summary/${p.id}` }, icon('printer'), 'ملخص الإنجاز للطباعة'),
        h('a', { class: 'btn btn-ghost', href: me === 'student' ? '#/portfolio' : `#/students/${p.student.id}` }, icon('award'), me === 'student' ? 'ملف إنجازاتي' : 'ملف الطالب'),
        p.actions.reviewCompany && h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => reviewCompany(p) }, icon('star'), 'قيّم تجربتك مع الشركة'))),
    { ico: 'award' });
  }
  if (p.status === 'cancelled') return section('المشروع ملغى', h('p', { class: 'muted' }, p.cancelReason || ''), { ico: 'alert' });

  const revisionBox = p.status === 'revision_requested' && last?.review && h('div', { class: 'callout callout-danger', role: 'note' },
    h('p', { class: 'callout-title' }, icon('refresh'), `ملاحظات التعديل على الجولة ${last.round}`),
    h('p', { class: 'prose' }, last.review.feedback));

  if (p.actions.submit) {
    return section(p.status === 'revision_requested' ? `أعد التسليم (الجولة ${p.deliverables.length + 1})` : 'سلّم العمل',
      h('div', { class: 'stack' }, revisionBox, submitForm(p)), { ico: 'upload' });
  }
  if (p.actions.review) {
    return section(`مراجعة الجولة ${last.round}`, h('div', { class: 'stack-sm' },
      h('p', null, `سلّم ${p.student.fullName} العمل. راجع الروابط والملفات في «التسليمات» ثم اختر:`),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-revise', onclick: () => askRevision(p) }, icon('refresh'), 'طلب تعديلات'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-approve', onclick: () => askApprove(p) }, icon('check'), 'اعتماد الإنجاز'))),
    { ico: 'eye' });
  }
  const waiting = me === 'student'
    ? ['بانتظار مراجعة الشركة', `سلّمت الجولة ${last?.round}. ستعتمد ${p.company.companyName} العمل أو تطلب تعديلات.`]
    : [p.status === 'revision_requested' ? 'بانتظار التعديلات' : 'العمل قيد التنفيذ', `${p.student.fullName} يعمل على المهمة. موعد التسليم: ${fmtDate(p.task.deadlineAt)} (${deadlineText(p.task.deadlineAt)}).`];
  return section(waiting[0], h('div', { class: 'stack-sm' }, revisionBox, h('p', null, waiting[1])), { ico: 'clock' });
}

function submitForm(p) {
  const files = uploader(p.id, { label: 'إرفاق ملفات التسليم' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, icon('upload'), 'تسليم العمل للمراجعة');
  const form = h('form', { class: 'stack submit-form', novalidate: true },
    field('روابط المخرجات', textarea({ name: 'links', id: 'sub-links', rows: 3, dir: 'ltr', placeholder: 'https://github.com/username/project\nhttps://www.figma.com/file/...' }), { hint: 'ضع كل رابط في سطر مستقل، مثل روابط GitHub أو Figma أو Google Drive.' }),
    field('ملاحظة التسليم', textarea({ name: 'note', id: 'sub-note', rows: 3, maxlength: 2000 }), { hint: 'ما الذي أنجزته؟ وهل هناك ما يجب أن تنتبه له الشركة؟ (10 أحرف على الأقل)' }),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'ملفات التسليم ', h('span', { class: 'field-optional' }, '(اختياري)')), files.el),
    h('div', { class: 'form-actions' }, submit));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const links = parseList(form.links.value);
    const noteText = form.note.value.trim();
    const errors = {};
    const bad = links.find((l) => !isUrl(l));
    if (bad) errors.links = `رابط غير صالح: ${bad}`;
    else if (!links.length && !files.ids().length) errors.links = 'أضف رابطاً واحداً على الأقل أو أرفق ملفاً.';
    if (noteText.length < 10) errors.note = 'اكتب ملاحظة قصيرة (10 أحرف على الأقل) تشرح ما سلّمته.';
    if (!showErrors(form, errors)) return;
    if (files.pending()) return toast('انتظر اكتمال رفع الملفات.', 'error');
    if (files.failed() && !await confirmDialog({ title: 'بعض الملفات لم تُرفع', body: h('p', null, 'المتابعة ستسلّم العمل دون الملفات الفاشلة.'), confirmLabel: 'متابعة التسليم' })) return;
    try {
      await busy(submit, 'جارٍ التسليم…', () => api.post(`/projects/${p.id}/deliverables`, { links, note: noteText, attachmentIds: files.ids() }));
      toast('سُلّم العمل وهو الآن بانتظار مراجعة الشركة.');
      refresh();
    } catch (err) { serverErrors(form, err); }
  });
  return form;
}

async function askRevision(p) {
  const fd = await formDialog({
    title: 'طلب تعديلات',
    description: 'اكتب ملاحظات واضحة ومحددة ليتمكن الطالب من إعادة التسليم.',
    fields: [field('ملاحظات التعديل', textarea({ name: 'feedback', rows: 5, maxlength: 2000 }), { hint: 'إلزامية، 15 حرفاً على الأقل.' })],
    submitLabel: 'إرسال طلب التعديل',
    validate: (form) => {
      const v = form.elements.namedItem('feedback').value.trim();
      return { feedback: v.length < 15 ? `الملاحظات مطلوبة (${v.length} من 15 حرفاً على الأقل).` : null };
    },
  });
  if (!fd) return;
  try {
    await api.post(`/projects/${p.id}/request-revision`, { feedback: String(fd.get('feedback')).trim() });
    toast('أُرسل طلب التعديل إلى الطالب.');
    refresh();
  } catch (err) { reportError(err); }
}

function ratingField() {
  return h('fieldset', { class: 'rating-field' },
    h('legend', { class: 'field-label' }, 'التقييم'),
    h('div', { class: 'rating-opts' }, [5, 4, 3, 2, 1].map((i) => h('label', { class: 'rate-opt' },
      h('input', { type: 'radio', name: 'rating', value: String(i), id: i === 5 ? 'rate-first' : null, 'aria-describedby': 'rate-first-err' }),
      h('span', null, icon('star'), String(i))))),
    h('p', { class: 'field-error', id: 'rate-first-err', hidden: true }));
}

const ratingValidate = (form) => {
  const text = form.elements.namedItem('comment').value.trim();
  return {
    rating: form.querySelector('[name="rating"]:checked') ? null : 'اختر تقييماً من 1 إلى 5.',
    comment: text.length < 15 ? `اكتب ملاحظة أطول (${text.length} من 15 حرفاً).` : null,
  };
};

async function askApprove(p) {
  const fd = await formDialog({
    title: 'اعتماد الإنجاز',
    description: `سيُغلق المشروع ويُضاف مع تقييمك إلى ملف ${p.student.fullName}. لا يغيّر الاعتماد حالة الدفع؛ الدفع الإلكتروني غير مفعّل بعد.`,
    fields: [ratingField(), field('ملاحظاتك على العمل', textarea({ name: 'comment', rows: 4, maxlength: 1000 }), { hint: 'تظهر في ملف إنجازات الطالب (15 حرفاً على الأقل).' })],
    submitLabel: 'اعتماد الإنجاز',
    validate: ratingValidate,
  });
  if (!fd) return;
  try {
    await api.post(`/projects/${p.id}/approve`, { rating: Number(fd.get('rating')), comment: String(fd.get('comment')).trim() });
    toast('اعتُمد الإنجاز وأضيف المشروع إلى ملف الطالب.');
    refresh();
  } catch (err) { reportError(err); }
}

async function reviewCompany(p) {
  const fd = await formDialog({
    title: `قيّم تجربتك مع ${p.company.companyName}`,
    description: 'يساعد تقييمك الطلاب الآخرين. يظهر متوسط التقييمات في صفحة الشركة.',
    fields: [ratingField(), field('ملاحظاتك', textarea({ name: 'comment', rows: 4, maxlength: 1000 }), { hint: '15 حرفاً على الأقل.' })],
    submitLabel: 'إرسال التقييم',
    validate: ratingValidate,
  });
  if (!fd) return;
  try {
    await api.post(`/projects/${p.id}/review`, { rating: Number(fd.get('rating')), comment: String(fd.get('comment')).trim() });
    toast('شكراً، أُرسل تقييمك.');
    refresh();
  } catch (err) { reportError(err); }
}

function milestonesPanel(p) {
  const done = p.milestones.filter((m) => m.doneAt).length;
  const total = p.milestones.length || 1;
  const canToggle = p.actions.toggleMilestones;
  const canManage = p.actions.manageMilestones;

  const toggle = async (m, checked) => {
    try { await api.patch(`/milestones/${m.id}`, { done: checked }); refresh(); } catch (err) { reportError(err); refresh(); }
  };
  const rename = async (m) => {
    const fd = await formDialog({
      title: 'تعديل المرحلة',
      fields: [field('عنوان المرحلة', input({ name: 'title', value: m.title, maxlength: 120 })), field('الموعد', input({ name: 'dueDate', type: 'date', dir: 'ltr', min: todayStr(), value: m.dueAt ? m.dueAt.slice(0, 10) : '' }), { optional: true })],
      submitLabel: 'حفظ',
      validate: (f) => ({ title: f.elements.namedItem('title').value.trim().length < 2 ? 'اكتب عنواناً للمرحلة.' : null }),
    });
    if (!fd) return;
    try { await api.patch(`/milestones/${m.id}`, { title: String(fd.get('title')).trim(), dueDate: fd.get('dueDate') || null }); refresh(); } catch (err) { reportError(err); }
  };
  const remove = async (m) => {
    if (!await confirmDialog({ title: 'حذف المرحلة؟', body: h('p', null, `«${m.title}»`), confirmLabel: 'حذف', danger: true })) return;
    try { await api.del(`/milestones/${m.id}`); refresh(); } catch (err) { reportError(err); }
  };

  const addForm = canManage && (() => {
    const submit = h('button', { type: 'submit', class: 'btn btn-ghost btn-sm' }, icon('plus'), 'إضافة مرحلة');
    const f = h('form', { class: 'ms-add', novalidate: true },
      field('مرحلة جديدة', input({ name: 'title', id: 'ms-new-title', maxlength: 120, placeholder: 'مثال: مراجعة الألوان' })),
      field('الموعد', input({ name: 'dueDate', type: 'date', dir: 'ltr', min: todayStr() }), { optional: true }),
      submit);
    liveClear(f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = f.elements.namedItem('title').value.trim();
      if (!showErrors(f, { title: title.length < 2 ? 'اكتب عنواناً للمرحلة.' : null })) return;
      try { await busy(submit, 'جارٍ الإضافة…', () => api.post(`/projects/${p.id}/milestones`, { title, dueDate: f.elements.namedItem('dueDate').value || null })); refresh(); } catch (err) { serverErrors(f, err); }
    });
    return f;
  })();

  return section('المراحل', h('div', { class: 'stack-sm' },
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(p.milestones.length), 'aria-valuenow': String(done), 'aria-label': 'تقدّم المراحل' },
      h('span', { class: 'progress-bar', style: `width:${(done / total) * 100}%` })),
    h('p', { class: 'muted small' }, `${done} من ${p.milestones.length} مراحل منجزة`),
    p.milestones.length ? h('ul', { class: 'ms-checks' }, p.milestones.map((m) => h('li', { class: 'ms-item' },
      canToggle
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', id: `ms-${m.id}`, checked: !!m.doneAt, onchange: (e) => toggle(m, e.target.checked) }), h('span', null, m.title))
        : h('span', { class: `check-static${m.doneAt ? ' is-done' : ''}` }, h('span', { class: 'tick' }, m.doneAt && icon('check')), h('span', null, m.title), h('span', { class: 'sr-only' }, m.doneAt ? ' (منجزة)' : ' (لم تُنجز)')),
      m.dueAt && h('span', { class: 'muted small' }, fmtDate(m.dueAt)),
      canManage && h('span', { class: 'ms-tools' },
        h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `تعديل «${m.title}»`, onclick: () => rename(m) }, icon('edit')),
        h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `حذف «${m.title}»`, onclick: () => remove(m) }, icon('x'))))))
      : h('p', { class: 'muted small' }, 'لا توجد مراحل.'),
    addForm), { ico: 'milestones' });
}

function deliverablesPanel(p) {
  if (!p.deliverables.length) {
    return section('التسليمات', emptyState({ ico: 'upload', title: 'لا توجد تسليمات بعد', text: 'تظهر هنا روابط المخرجات والملفات عند كل تسليم.' }), { ico: 'upload' });
  }
  return section(`التسليمات (${p.deliverables.length})`, h('ol', { class: 'submissions' }, [...p.deliverables].reverse().map((d) => h('li', { class: 'submission' },
    h('div', { class: 'submission-head' }, h('strong', null, `الجولة ${d.round}`), h('time', { class: 'muted small', datetime: d.createdAt }, fmtDateTime(d.createdAt))),
    h('p', { class: 'prose' }, d.note),
    d.links.length > 0 && h('ul', { class: 'link-list' }, d.links.map((l) => h('li', null, extLink(l)))),
    attachmentList(d.attachments),
    d.review && h('p', { class: `small ${d.review.decision === 'approved' ? 'ok-text' : 'danger-text'}` },
      d.review.decision === 'approved' ? 'اعتُمدت هذه الجولة' : `طُلبت تعديلات: ${d.review.feedback}`)))), { ico: 'upload' });
}

function briefPanel(p) {
  const t = p.task;
  return h('details', { class: 'panel brief' },
    h('summary', { class: 'panel-title' }, icon('file'), 'موجز المهمة', icon('chevron-left', 'faq-chev')),
    h('div', { class: 'stack-sm brief-body' },
      h('p', { class: 'prose' }, t.scope),
      h('h3', { class: 'sub-title' }, 'المخرجات'),
      h('ul', { class: 'check-list' }, t.deliverables.map((d) => h('li', null, icon('check'), h('span', null, d)))),
      h('h3', { class: 'sub-title' }, 'المهارات'),
      skillChips(t.skills),
      h('ul', { class: 'meta-row' },
        h('li', { class: 'inset-pill pill-accent' }, icon('wallet'), bdi(fmtJOD(t.budget))),
        h('li', { class: 'inset-pill' }, icon('clock'), fmtDays(t.durationDays)),
        h('li', { class: 'inset-pill' }, icon('calendar'), fmtDate(t.deadlineAt)))));
}

function messagesPanel(p, initial) {
  const me = p.viewerRole;
  const list = h('ol', { class: 'messages', 'aria-label': 'الرسائل', tabindex: '0', 'aria-live': 'polite' });
  const canSend = p.actions.message;
  let state = initial;

  const paint = () => {
    list.replaceChildren(...(state.items.length ? state.items.map((m) => {
      const mine = m.senderRole === me;
      const name = m.senderRole === 'student' ? p.student.fullName : p.company.companyName;
      return h('li', { class: `msg${mine ? ' msg-mine' : ''}` },
        avatar(name, 'avatar-sm'),
        h('div', { class: 'msg-bubble' },
          h('p', { class: 'msg-meta' }, h('strong', null, mine ? 'أنت' : name), ' · ', h('time', { datetime: m.createdAt, title: fmtDateTime(m.createdAt) }, fmtRelative(m.createdAt))),
          h('p', { class: 'msg-text' }, m.body),
          attachmentList(m.attachments)));
    }) : [h('li', { class: 'muted small msg-empty' }, 'لا توجد رسائل بعد. ابدأ المحادثة.')]));
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  };
  paint();

  const reload = async () => {
    try { state = await api.get(`/projects/${p.id}/messages`); paint(); } catch { /* keep current list */ }
  };

  let form = null;
  if (canSend) {
    const files = uploader(p.id, { label: 'إرفاق', max: 5 });
    const ta = textarea({ name: 'body', id: 'msg-input', rows: 2, maxlength: 4000, placeholder: 'اكتب رسالة… (Ctrl+Enter للإرسال)', 'aria-label': 'نص الرسالة' });
    const sendBtn = h('button', { type: 'submit', class: 'btn btn-primary', id: 'msg-send' }, icon('send'), 'إرسال');
    form = h('form', { class: 'stack-sm', novalidate: true }, h('div', { class: 'msg-form' }, ta, sendBtn), p.status !== 'completed' && files.el);
    const send = async () => {
      const body = ta.value.trim();
      if (!body) { toast('اكتب نص الرسالة أولاً.', 'error'); ta.focus(); return; }
      if (files.pending()) { toast('انتظر اكتمال رفع الملفات.', 'error'); return; }
      try {
        await busy(sendBtn, 'إرسال…', () => api.post(`/projects/${p.id}/messages`, { body, attachmentIds: files.ids() }));
        ta.value = '';
        if (files.ids().length) { refresh(); return; }
        await reload();
        document.getElementById('msg-input')?.focus();
      } catch (err) { reportError(err); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  }

  const el = section('الرسائل', h('div', { class: 'stack-sm' },
    list, form,
    h('p', { class: 'field-hint' }, 'الرسائل والملفات محفوظة على الخادم ومرئية لطرفي المشروع فقط، وتصل الجديدة منها مباشرة.')),
  { ico: 'message' });
  return { el, reload };
}

// ---------- printable summary ----------
export async function summary({ params }) {
  const p = await api.get(`/projects/${params.id}`);
  if (p.status !== 'completed') {
    return h('div', { class: 'page' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'الملخص غير متاح'),
      emptyState({ ico: 'printer', title: 'يتوفر الملخص بعد اعتماد الإنجاز', action: h('a', { class: 'btn btn-primary', href: `#/projects/${p.id}` }, 'العودة إلى المشروع') }));
  }
  const review = p.reviews.find((r) => r.reviewerRole === 'company');
  const row = (label, value) => h('div', { class: 'sum-row' }, h('dt', null, label), h('dd', null, value));
  return h('div', { class: 'page' },
    h('div', { class: 'no-print btn-row summary-tools' },
      h('a', { class: 'btn btn-ghost', href: `#/projects/${p.id}` }, icon('chevron-right'), 'العودة إلى المشروع'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => window.print() }, icon('printer'), 'طباعة / حفظ PDF')),
    h('article', { class: 'summary-sheet' },
      h('header', { class: 'sum-head' }, brand(), h('p', { class: 'sum-stamp' }, 'ملخص من المنصة — ليس شهادة معتمدة')),
      h('h1', { class: 'sum-title', tabindex: '-1', 'data-page-title': true }, 'ملخص إنجاز مشروع'),
      h('p', { class: 'sum-project' }, p.task.title),
      h('dl', { class: 'sum-grid' },
        row('الطالب', [p.student.fullName, p.student.major, p.student.university].filter(Boolean).join(' — ')),
        row('الجهة', [p.company.companyName, p.company.city].filter(Boolean).join(' — ')),
        row('الفئة', categoryOf(p.task.category).label),
        row('المدة', `${fmtDate(p.startedAt)} ← ${fmtDate(p.completedAt)}`),
        row('جولات التسليم', String(p.deliverables.length)),
        row('الميزانية المتفق عليها', h('span', null, bdi(fmtJOD(p.task.budget)), ' — حالة الدفع لا يوثّقها هذا الملخص'))),
      h('h2', { class: 'sum-sub' }, 'المخرجات'),
      h('ul', { class: 'sum-list' }, p.task.deliverables.map((d) => h('li', null, d))),
      h('h2', { class: 'sum-sub' }, 'المراحل المنجزة'),
      h('ul', { class: 'sum-list' }, p.milestones.map((m) => h('li', null, m.title))),
      h('h2', { class: 'sum-sub' }, 'المهارات'),
      h('p', null, p.task.skills.map((x, i) => [i ? '، ' : '', bdi(x)])),
      review && [h('h2', { class: 'sum-sub' }, 'تقييم الجهة'), stars(review.rating), h('p', { class: 'sum-quote' }, review.comment)],
      h('footer', { class: 'sum-foot' },
        'أُنشئ هذا الملخص من سجلات منصة مهمّة. لا يمثّل شهادة أكاديمية أو مهنية معتمدة من أي جهة، ولا يثبت حدوث أي دفع.',
        h('br'), `رقم المشروع: `, bdi(p.id, 'ltr'), ` · تاريخ الإنشاء: ${fmtDate(new Date().toISOString())}`)));
}
