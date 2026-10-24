// Shared project workspace, project list and the printable completion summary.
import { h, bdi, fmtJOD, fmtDate, fmtDateTime, fmtDays, fmtRelative, isUrl, parseList } from '../dom.js';
import { icon } from '../icons.js';
import { PROJECT_STATUS } from '../data.js';
import {
  pageHeader, section, emptyState, statusBadge, demoBadge, skillChips, field, textarea, showErrors, liveClear,
  busy, toast, reportError, note, extLink, formDialog, openDialog, stars, avatar,
} from '../ui.js';
import { switchTo, brand } from '../shell.js';
import { putFile, getFile } from '../files.js';
import { categoryOf, deadlineText, projectRow } from './student.js';
import * as store from '../store.js';

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;

function viewerRole(p) {
  const s = store.session();
  if (s.role === 'student' && p.studentId === s.studentId) return 'student';
  if (s.role === 'company' && p.companyId === s.companyId) return 'company';
  return null;
}

// ---------- list ----------
export function projectsList() {
  const projects = store.myProjects().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = projects.filter((p) => p.status !== 'completed');
  const done = projects.filter((p) => p.status === 'completed');
  const isStudent = store.role() === 'student';
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: isStudent ? 'مشاريعي' : 'المشاريع', title: 'المشاريع', subtitle: 'كل مشروع يبدأ عند اختيار طالب لمهمة، وينتهي عند اعتماد الشركة للإنجاز.' }),
    projects.length ? h('div', { class: 'dash-grid' },
      section(`جارية (${active.length})`, active.length ? h('ul', { class: 'rows' }, active.map(projectRow))
        : emptyState({ ico: 'folder', title: 'لا توجد مشاريع جارية' }), { ico: 'folder' }),
      section(`مكتملة (${done.length})`, done.length ? h('ul', { class: 'rows' }, done.map(projectRow))
        : emptyState({ ico: 'award', title: 'لا توجد مشاريع مكتملة بعد' }), { ico: 'award' }))
      : emptyState({
        ico: 'folder', title: 'لا توجد مشاريع بعد',
        text: isStudent ? 'تقدّم لمهمة، وعندما تختارك الشركة يبدأ المشروع هنا.' : 'اختر متقدّماً لإحدى مهامك لبدء مشروع.',
        action: h('a', { class: 'btn btn-primary', href: isStudent ? '#/tasks' : '#/company/tasks' }, isStudent ? 'استكشف المهام' : 'مهامي المنشورة'),
      }));
}

// ---------- workspace ----------
export function workspace({ params }) {
  const p = store.projectById(params.id);
  if (!p) return null;
  const me = viewerRole(p);
  const t = store.taskById(p.taskId);
  const s = store.studentById(p.studentId);
  const c = store.companyById(p.companyId);

  if (!me) {
    const needed = store.role() === 'student' ? 'company' : 'student';
    return h('div', { class: 'page' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'مشروع غير متاح'),
      emptyState({
        ico: 'shield', title: 'هذا المشروع لا يخص الحساب التجريبي الحالي',
        text: 'يظهر المشروع لطرفيه فقط. (هذا تحقق تجريبي داخل المتصفح وليس حماية حقيقية.)',
        action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => switchTo(needed) }, icon('switch'), 'تبديل الوضع'),
      }));
  }

  return h('div', { class: 'page' },
    h('a', { class: 'back-link', href: '#/projects' }, icon('chevron-right'), 'المشاريع'),
    pageHeader({
      eyebrow: 'مساحة المشروع', title: t.title,
      subtitle: h('span', { class: 'inline-meta' }, icon('graduation'), s.name, h('span', { class: 'muted' }, '⇄'), icon('building'), c.name, p.demo && demoBadge()),
      actions: statusBadge(PROJECT_STATUS, p.status),
    }),
    statusTrack(p),
    note(`تشاهد المشروع بصفتك ${me === 'student' ? 'الطالب' : 'الشركة'}. تتغير الإجراءات حسب الدور والحالة — سلوك تجريبي داخل المتصفح، وليس صلاحيات آمنة.`, 'shield'),
    h('div', { class: 'workspace-grid' },
      h('div', { class: 'stack' },
        actionPanel(p, me, t, s, c),
        milestonesPanel(p, me),
        submissionsPanel(p),
        briefPanel(t, c)),
      h('div', { class: 'stack' },
        messagesPanel(p, me, s, c),
        section('سجل النشاط', h('ol', { class: 'timeline' }, [...p.activity].reverse().map((a) =>
          h('li', null, h('span', { class: 'timeline-dot', 'aria-hidden': 'true' }), h('span', null, a.text), h('time', { datetime: a.at, class: 'muted small' }, fmtDateTime(a.at))))),
        { ico: 'history' }))));
}

function statusTrack(p) {
  const steps = [['in_progress', 'قيد التنفيذ'], ['review', 'بانتظار المراجعة'], ['completed', 'مكتملة']];
  const order = { in_progress: 0, revision: 0, review: 1, completed: 2 };
  const cur = order[p.status];
  return h('ol', { class: 'status-track', 'aria-label': 'مراحل حالة المشروع' },
    steps.map(([key, label], i) => h('li', { class: `track-item${i < cur ? ' is-done' : ''}${i === cur ? ' is-current' : ''}`, 'aria-current': i === cur ? 'step' : null },
      h('span', { class: 'track-dot' }, i < cur ? icon('check') : String(i + 1)),
      h('span', null, i === 0 && p.status === 'revision' ? 'مطلوب تعديل' : label))));
}

function actionPanel(p, me, t, s, c) {
  const round = p.submissions.length;
  if (p.status === 'completed') {
    return section('اكتمل المشروع', h('div', { class: 'stack-sm' },
      h('p', null, `اعتمدت ${c.name} الإنجاز في ${fmtDate(p.completedAt)}.`),
      p.feedback && h('div', { class: 'feedback' }, stars(p.feedback.rating), h('p', { class: 'prose quote' }, p.feedback.text)),
      note('لا يتم أي دفع حقيقي: الميزانية المعروضة توضيحية فقط.', 'shield'),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn-primary', href: `#/summary/${p.id}` }, icon('printer'), 'ملخص الإنجاز للطباعة'),
        h('a', { class: 'btn btn-ghost', href: me === 'student' ? '#/portfolio' : `#/portfolio/${s.id}` }, icon('award'), me === 'student' ? 'ملف إنجازاتي' : 'ملف الطالب'))),
    { ico: 'award' });
  }

  const revisionBox = p.status === 'revision' && p.revisionNote && h('div', { class: 'callout callout-danger', role: 'note' },
    h('p', { class: 'callout-title' }, icon('refresh'), 'ملاحظات التعديل من الشركة'),
    h('p', { class: 'prose' }, p.revisionNote));

  if (me === 'student') {
    if (p.status === 'review') {
      return section('بانتظار مراجعة الشركة', h('div', { class: 'stack-sm' },
        h('p', null, `سلّمت الجولة ${round}. ستعتمد ${c.name} العمل أو تطلب تعديلات.`),
        h('p', { class: 'muted small' }, 'لتجربة الخطوة التالية، بدّل إلى وضع الشركة.'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => switchTo('company', `/projects/${p.id}`) }, icon('switch'), 'التبديل إلى الشركة ومراجعة العمل')),
      { ico: 'clock' });
    }
    return section(p.status === 'revision' ? `أعد التسليم (الجولة ${round + 1})` : 'سلّم العمل', h('div', { class: 'stack' }, revisionBox, submitForm(p)), { ico: 'upload' });
  }

  // company
  if (p.status === 'review') {
    return section(`مراجعة الجولة ${round}`, h('div', { class: 'stack-sm' },
      h('p', null, `سلّم ${s.name} العمل. راجع الروابط والملفات في «التسليمات» ثم اختر:`),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-revise', onclick: () => askRevision(p) }, icon('refresh'), 'طلب تعديلات'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-approve', onclick: () => askApprove(p, s) }, icon('check'), 'اعتماد الإنجاز'))),
    { ico: 'eye' });
  }
  return section(p.status === 'revision' ? 'بانتظار التعديلات' : 'العمل قيد التنفيذ', h('div', { class: 'stack-sm' },
    revisionBox,
    h('p', null, `${s.name} يعمل على المهمة. موعد التسليم: ${fmtDate(t.deadline)} (${deadlineText(t.deadline)}).`),
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => switchTo('student', `/projects/${p.id}`) }, icon('switch'), 'التبديل إلى الطالب للتسليم')),
  { ico: 'clock' });
}

function submitForm(p) {
  let files = [];
  const fileList = h('ul', { class: 'file-list', 'aria-live': 'polite' }, h('li', { class: 'muted small' }, 'لم تختر ملفات.'));
  const fileInput = h('input', { type: 'file', name: 'files', id: 'sub-files', class: 'file-input', multiple: true, accept: 'image/*,application/pdf' });
  const pickBtn = h('label', { for: 'sub-files', class: 'btn btn-ghost btn-sm file-pick', 'aria-hidden': 'true' }, icon('paperclip'), 'اختر ملفات');
  fileInput.addEventListener('change', () => {
    files = [...fileInput.files];
    if (!files.length) { fileList.replaceChildren(h('li', { class: 'muted small' }, 'لم تختر ملفات.')); return; }
    fileList.replaceChildren(...files.map((f) => {
      const thumb = f.type.startsWith('image/') ? h('img', { src: URL.createObjectURL(f), alt: '', class: 'file-thumb' }) : h('span', { class: 'file-thumb file-thumb-icon' }, icon('file'));
      return h('li', null, thumb, h('span', { class: 'file-name' }, bdi(f.name)), h('span', { class: 'muted small' }, `${(f.size / 1024).toFixed(0)} KB`));
    }));
  });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, icon('upload'), 'تسليم العمل للمراجعة');
  const form = h('form', { class: 'stack', novalidate: true },
    field('روابط المخرجات', textarea({ name: 'links', id: 'sub-links', rows: 3, dir: 'ltr', placeholder: 'https://github.com/username/project\nhttps://www.figma.com/file/...' }), { hint: 'ضع كل رابط في سطر مستقل، مثل روابط GitHub أو Figma أو Google Drive.' }),
    field('ملاحظة التسليم', textarea({ name: 'note', id: 'sub-note', rows: 3, maxlength: 800 }), { hint: 'ما الذي أنجزته؟ هل هناك ما يجب أن تنتبه له الشركة؟' }),
    field('ملفات للمعاينة', h('div', { class: 'file-drop' }, fileInput, pickBtn, fileList), { optional: true, hint: `صور أو PDF، حتى ${MAX_FILES} ملفات و5 ميغابايت لكل ملف. تُحفظ في هذا المتصفح فقط ولا تُرفع إلى أي خادم.` }),
    h('div', { class: 'form-actions' }, submit));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const links = parseList(String(fd.get('links')));
    const noteText = String(fd.get('note')).trim();
    const errors = {};
    const bad = links.find((l) => !isUrl(l));
    if (bad) errors.links = `رابط غير صالح: ${bad}`;
    else if (!links.length && !files.length) errors.links = 'أضف رابطاً واحداً على الأقل أو أرفق ملفاً.';
    if (noteText.length < 10) errors.note = 'اكتب ملاحظة قصيرة (10 أحرف على الأقل) تشرح ما سلّمته.';
    if (files.length > MAX_FILES) errors.files = `الحد الأقصى ${MAX_FILES} ملفات.`;
    else if (files.some((f) => f.size > MAX_BYTES)) errors.files = 'أحد الملفات أكبر من 5 ميغابايت.';
    else if (files.some((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'))) errors.files = 'الأنواع المسموحة: صور أو PDF فقط.';
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ التسليم…', async () => {
        const attachments = [];
        for (const f of files) {
          const id = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
          try { await putFile(id, f); } catch { throw new Error('تعذّر حفظ الملف في المتصفح. جرّب ملفاً أصغر أو أرسل رابطاً بدلاً منه.'); }
          attachments.push({ id, name: f.name, type: f.type, size: f.size });
        }
        store.submitWork(p.id, { links, note: noteText, attachments });
      });
      toast('سُلّم العمل وهو الآن بانتظار مراجعة الشركة.');
    } catch (err) { reportError(err); }
  });
  return form;
}

async function askRevision(p) {
  const fd = await formDialog({
    title: 'طلب تعديلات',
    description: 'اكتب ملاحظات واضحة ومحددة ليتمكن الطالب من إعادة التسليم.',
    fields: [field('ملاحظات التعديل', textarea({ name: 'feedback', rows: 5, maxlength: 800 }), { hint: 'إلزامية، 15 حرفاً على الأقل.' })],
    submitLabel: 'إرسال طلب التعديل',
    validate: (form) => {
      const v = form.elements.namedItem('feedback').value.trim();
      return { feedback: v.length < 15 ? `الملاحظات مطلوبة (${v.length} من 15 حرفاً على الأقل).` : null };
    },
  });
  if (!fd) return;
  try {
    store.requestRevision(p.id, String(fd.get('feedback')).trim());
    toast('أُرسل طلب التعديل إلى الطالب.');
  } catch (err) { reportError(err); }
}

async function askApprove(p, s) {
  const rating = h('fieldset', { class: 'rating-field' },
    h('legend', { class: 'field-label' }, 'تقييم العمل'),
    h('div', { class: 'rating-opts' }, [5, 4, 3, 2, 1].map((i) => h('label', { class: 'rate-opt' },
      h('input', { type: 'radio', name: 'rating', value: String(i), id: i === 5 ? 'rate-first' : null, 'aria-describedby': 'rate-first-err' }),
      h('span', null, icon('star'), String(i))))),
    h('p', { class: 'field-error', id: 'rate-first-err', hidden: true }));
  const fd = await formDialog({
    title: 'اعتماد الإنجاز',
    description: `سيُغلق المشروع ويُضاف مع تقييمك إلى ملف ${s.name}. لا يتم أي دفع حقيقي في هذا النموذج.`,
    fields: [rating, field('ملاحظاتك على العمل', textarea({ name: 'feedbackText', rows: 4, maxlength: 600 }), { hint: 'تظهر في ملف إنجازات الطالب (15 حرفاً على الأقل).' })],
    submitLabel: 'اعتماد الإنجاز',
    validate: (form) => {
      const text = form.elements.namedItem('feedbackText').value.trim();
      return {
        rating: form.querySelector('[name="rating"]:checked') ? null : 'اختر تقييماً من 1 إلى 5.',
        feedbackText: text.length < 15 ? `اكتب ملاحظة أطول (${text.length} من 15 حرفاً).` : null,
      };
    },
  });
  if (!fd) return;
  try {
    store.approveProject(p.id, { rating: Number(fd.get('rating')), text: String(fd.get('feedbackText')).trim() });
    toast('اعتُمد الإنجاز وأضيف المشروع إلى ملف الطالب.');
  } catch (err) { reportError(err); }
}

function milestonesPanel(p, me) {
  const done = p.milestones.filter((m) => m.done).length;
  const editable = me === 'student' && ['in_progress', 'revision'].includes(p.status);
  return section('المراحل', h('div', { class: 'stack-sm' },
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(p.milestones.length), 'aria-valuenow': String(done), 'aria-label': 'تقدّم المراحل' },
      h('span', { class: 'progress-bar', style: `width:${(done / p.milestones.length) * 100}%` })),
    h('p', { class: 'muted small' }, `${done} من ${p.milestones.length} مراحل منجزة${editable ? ' · حدّث المراحل أثناء العمل' : ''}`),
    h('ul', { class: 'ms-checks' }, p.milestones.map((m, i) => h('li', null, editable
      ? h('label', { class: 'check' },
        h('input', { type: 'checkbox', id: `ms-${p.id}-${i}`, checked: m.done, onchange: () => { try { store.toggleMilestone(p.id, i); } catch (err) { reportError(err); } } }),
        h('span', null, m.title))
      : h('span', { class: `check-static${m.done ? ' is-done' : ''}` }, h('span', { class: 'tick' }, m.done && icon('check')), h('span', null, m.title), h('span', { class: 'sr-only' }, m.done ? ' (منجزة)' : ' (لم تُنجز)')))))),
  { ico: 'milestones' });
}

function submissionsPanel(p) {
  if (!p.submissions.length) {
    return section('التسليمات', emptyState({ ico: 'upload', title: 'لا توجد تسليمات بعد', text: 'تظهر هنا روابط المخرجات والملفات عند كل تسليم.' }), { ico: 'upload' });
  }
  return section(`التسليمات (${p.submissions.length})`, h('ol', { class: 'submissions' }, [...p.submissions].reverse().map((sub) =>
    h('li', { class: 'submission' },
      h('div', { class: 'submission-head' }, h('strong', null, `الجولة ${sub.round}`), h('time', { class: 'muted small', datetime: sub.at }, fmtDateTime(sub.at))),
      h('p', { class: 'prose' }, sub.note),
      sub.links.length > 0 && h('ul', { class: 'link-list' }, sub.links.map((l) => h('li', null, extLink(l)))),
      sub.attachments.length > 0 && h('ul', { class: 'attach-list' }, sub.attachments.map(attachment))))),
  { ico: 'upload' });
}

// ponytail: object URLs are never revoked; fine for a demo session, revoke on dialog close if memory matters.
function attachment(a) {
  const isImg = a.type.startsWith('image/');
  const thumb = h('span', { class: 'file-thumb file-thumb-icon' }, icon(isImg ? 'image' : 'file'));
  const btn = h('button', { type: 'button', class: 'attach', 'aria-label': `معاينة ${a.name}` }, thumb, h('span', { class: 'file-name' }, bdi(a.name)));
  getFile(a.id).then((blob) => {
    if (!blob) { btn.disabled = true; btn.title = 'الملف غير متاح على هذا الجهاز'; btn.append(h('span', { class: 'muted small' }, ' (غير متاح هنا)')); return; }
    const url = URL.createObjectURL(blob);
    if (isImg) thumb.replaceWith(h('img', { src: url, alt: '', class: 'file-thumb' }));
    btn.addEventListener('click', () => {
      if (!isImg) { window.open(url, '_blank', 'noopener'); return; }
      openDialog({ title: a.name, wide: true, body: h('div', { class: 'dialog-body' }, h('img', { src: url, alt: `معاينة ${a.name}`, class: 'preview-img' })) });
    });
  }).catch(() => { btn.disabled = true; });
  return h('li', null, btn);
}

function briefPanel(t, c) {
  return h('details', { class: 'panel brief', open: true },
    h('summary', { class: 'panel-title' }, icon('file'), 'موجز المشروع', icon('chevron-left', 'faq-chev')),
    h('div', { class: 'stack-sm brief-body' },
      h('p', { class: 'prose' }, t.scope),
      h('h3', { class: 'sub-title' }, 'المخرجات'),
      h('ul', { class: 'check-list' }, t.deliverables.map((d) => h('li', null, icon('check'), h('span', null, d)))),
      h('h3', { class: 'sub-title' }, 'المهارات'),
      skillChips(t.skills),
      h('ul', { class: 'meta-row' },
        h('li', { class: 'inset-pill pill-accent' }, icon('wallet'), bdi(fmtJOD(t.budget))),
        h('li', { class: 'inset-pill' }, icon('clock'), fmtDays(t.durationDays)),
        h('li', { class: 'inset-pill' }, icon('calendar'), fmtDate(t.deadline))),
      note('الميزانية توضيحية: لا يتم حجز أو تحويل أي مبلغ في هذا النموذج الأولي.', 'shield'),
      h('p', { class: 'muted small' }, `${c.name} · ${c.industry} · ${c.city}`)));
}

function messagesPanel(p, me, s, c) {
  const list = h('ol', { class: 'messages', 'aria-label': 'الرسائل', tabindex: '0' },
    p.messages.length ? p.messages.map((m) => {
      const mine = m.from === me;
      const name = m.from === 'student' ? s.name : c.name;
      return h('li', { class: `msg${mine ? ' msg-mine' : ''}` },
        avatar(name, 'avatar-sm'),
        h('div', { class: 'msg-bubble' },
          h('p', { class: 'msg-meta' }, h('strong', null, mine ? 'أنت' : name), ' · ', h('time', { datetime: m.at }, fmtRelative(m.at))),
          h('p', { class: 'msg-text' }, m.text)));
    }) : h('li', { class: 'muted small msg-empty' }, 'لا توجد رسائل بعد. ابدأ المحادثة.'));
  const ta = textarea({ name: 'message', id: 'msg-input', rows: 2, maxlength: 600, placeholder: 'اكتب رسالة…', 'aria-label': 'نص الرسالة' });
  const form = h('form', { class: 'msg-form', novalidate: true },
    ta, h('button', { type: 'submit', class: 'btn btn-primary', id: 'msg-send' }, icon('send'), 'إرسال'));
  const send = () => {
    const text = ta.value.trim();
    if (!text) { toast('اكتب نص الرسالة أولاً.', 'error'); ta.focus(); return; }
    try {
      store.sendMessage(p.id, text);
      document.getElementById('msg-input')?.focus();
    } catch (err) { reportError(err); }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  return section('الرسائل', h('div', { class: 'stack-sm' }, list, form,
    h('p', { class: 'field-hint' }, 'تُحفظ الرسائل في هذا المتصفح فقط وتظهر عند التبديل بين الدورين. لا يوجد تواصل فوري بين الأجهزة.')),
  { ico: 'message' });
}

// ---------- printable summary ----------
export function summary({ params }) {
  const p = store.projectById(params.id);
  if (!p || !viewerRole(p)) return null;
  const t = store.taskById(p.taskId);
  const s = store.studentById(p.studentId);
  const c = store.companyById(p.companyId);
  if (p.status !== 'completed') {
    return h('div', { class: 'page' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-page-title': true }, 'الملخص غير متاح'),
      emptyState({ ico: 'printer', title: 'يتوفر الملخص بعد اعتماد الإنجاز', action: h('a', { class: 'btn btn-primary', href: `#/projects/${p.id}` }, 'العودة إلى المشروع') }));
  }
  const row = (label, value) => h('div', { class: 'sum-row' }, h('dt', null, label), h('dd', null, value));
  return h('div', { class: 'page' },
    h('div', { class: 'no-print btn-row summary-tools' },
      h('a', { class: 'btn btn-ghost', href: `#/projects/${p.id}` }, icon('chevron-right'), 'العودة إلى المشروع'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => window.print() }, icon('printer'), 'طباعة / حفظ PDF')),
    h('article', { class: 'summary-sheet' },
      h('header', { class: 'sum-head' }, brand(),
        h('p', { class: 'sum-stamp' }, 'نموذج أولي — ليس شهادة معتمدة')),
      h('h1', { class: 'sum-title', tabindex: '-1', 'data-page-title': true }, 'ملخص إنجاز مشروع'),
      h('p', { class: 'sum-project' }, t.title),
      h('dl', { class: 'sum-grid' },
        row('الطالب', `${s.name} — ${s.major}، ${s.university}`),
        row('الجهة', `${c.name} — ${c.city}`),
        row('الفئة', categoryOf(t.category).label),
        row('المدة', `${fmtDate(p.startedAt)} ← ${fmtDate(p.completedAt)}`),
        row('جولات التسليم', String(p.submissions.length)),
        row('الميزانية المعروضة', h('span', null, bdi(fmtJOD(t.budget)), ' (توضيحية، دون معاملة مالية حقيقية)'))),
      h('h2', { class: 'sum-sub' }, 'المخرجات'),
      h('ul', { class: 'sum-list' }, t.deliverables.map((d) => h('li', null, d))),
      h('h2', { class: 'sum-sub' }, 'المراحل المنجزة'),
      h('ul', { class: 'sum-list' }, p.milestones.map((m) => h('li', null, m.title))),
      h('h2', { class: 'sum-sub' }, 'المهارات المستخدمة'),
      h('p', null, t.skills.map((x, i) => [i ? '، ' : '', bdi(x)])),
      p.feedback && [h('h2', { class: 'sum-sub' }, 'تقييم الجهة'), stars(p.feedback.rating), h('p', { class: 'sum-quote' }, p.feedback.text)],
      h('footer', { class: 'sum-foot' },
        'أُنشئ هذا الملخص من بيانات تجريبية محفوظة في متصفحك ضمن نموذج أولي لمنصة مهمّة. لا يمثّل شهادة أو توثيقاً أو اعتماداً من أي جهة، ولا يثبت حدوث أي دفع.',
        h('br'), `تاريخ الإنشاء: ${fmtDate(new Date().toISOString())}`)));
}
