// Admin area. Every moderation action requires a written reason and is recorded server-side.
import { h, bdi, fmtJOD, fmtDateTime, fmtRelative } from '../dom.js';
import { PROJECT_STATUS, TASK_STATUS, PAYMENT_STATUS, REPORT_REASONS } from '../data.js';
import { pageHeader, stat, emptyState, statusBadge, badge, demoBadge, field, textarea, select, input, formDialog, toast, reportError, pager, note } from '../ui.js';
import { api } from '../api.js';
import { navigate, refresh } from '../router.js';

const REASON_LABEL = Object.fromEntries(REPORT_REASONS);
const go = (path, params) => navigate(`${path}${Object.values(params).some(Boolean) ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}` : ''}`);

async function askReason(title, description, { label = 'السبب', extra = [], submitLabel = 'تأكيد', danger = false } = {}) {
  const fd = await formDialog({
    title, description, submitLabel, danger,
    fields: [...extra, field(label, textarea({ name: 'reason', rows: 3, maxlength: 1000 }), { hint: 'إلزامي ويُحفظ في سجل الإدارة (5 أحرف على الأقل).' })],
    validate: (f) => ({ reason: f.elements.namedItem('reason').value.trim().length < 5 ? 'اكتب سبباً واضحاً.' : null }),
  });
  return fd && { reason: String(fd.get('reason')).trim(), fd };
}

const filterBar = (...controls) => h('div', { class: 'panel filter-row admin-filters' }, controls);
const labeled = (label, control) => h('label', { class: 'filter-field' }, h('span', { class: 'filter-label' }, label), control);

export async function overview() {
  const o = await api.get('/admin/overview');
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'نظرة عامة', subtitle: 'أرقام محسوبة مباشرة من قاعدة البيانات.' }),
    h('div', { class: 'stats' },
      stat('طلبات توثيق معلّقة', o.pendingVerifications, 'building', '/admin/companies?status=pending'),
      stat('بلاغات مفتوحة', o.openReports, 'alert', '/admin/reports?status=open'),
      stat('نزاعات مفتوحة', o.openDisputes, 'folder', '/admin/projects?disputed=1'),
      stat('مشاريع نشطة', o.activeProjects, 'briefcase', '/admin/projects')),
    h('div', { class: 'stats' },
      stat('طلاب', o.students, 'graduation', '/admin/users?role=student'),
      stat('شركات', o.companies, 'building', '/admin/users?role=company'),
      stat('حسابات موقوفة', o.suspended, 'shield', '/admin/users?status=suspended'),
      stat('مهام مخفية', o.hiddenTasks, 'eye', '/admin/tasks?moderation=hidden')),
    note(`مدفوعات بانتظار ربط مزوّد الدفع: ${o.paymentsPendingIntegration}. لا يوجد مزوّد دفع حي؛ راجع PAYMENTS-RESEARCH.md.`, 'wallet'));
}

export async function companies({ query }) {
  const status = query.get('status') || '';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/companies', { status, page });
  const decide = (c, decision) => async () => {
    const fd = await formDialog({
      title: decision === 'verified' ? `توثيق ${c.companyName}` : `رفض توثيق ${c.companyName}`,
      description: decision === 'verified' ? 'تظهر شارة «شركة موثّقة» بعد هذا القرار. اكتب ما الذي تحققت منه فعلاً (مثل السجل التجاري أو الاتصال بالمسؤول).' : 'تصل الملاحظة إلى الشركة لتصحيح بياناتها.',
      fields: [field(decision === 'verified' ? 'ما الذي تم التحقق منه' : 'سبب الرفض', textarea({ name: 'note', rows: 3, maxlength: 1000 }), { hint: '10 أحرف على الأقل.' })],
      submitLabel: decision === 'verified' ? 'توثيق الشركة' : 'رفض الطلب', danger: decision !== 'verified',
      validate: (f) => ({ note: f.elements.namedItem('note').value.trim().length < 10 ? 'اكتب ملاحظة أوضح (10 أحرف على الأقل).' : null }),
    });
    if (!fd) return;
    try { await api.post(`/admin/companies/${c.id}/verification`, { decision, note: String(fd.get('note')).trim() }); toast('حُفظ القرار.'); refresh(); } catch (err) { reportError(err); }
  };
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'توثيق الشركات', subtitle: 'لا تُمنح الشارة إلا بعد مراجعة فعلية تُوثَّق ملاحظتها.' }),
    filterBar(labeled('الحالة', select({ value: status, onchange: (e) => go('/admin/companies', { status: e.target.value }) },
      [['pending', 'قيد المراجعة'], ['unverified', 'غير موثّقة'], ['verified', 'موثّقة'], ['rejected', 'مرفوضة']], 'الكل'))),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((c) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('h2', { class: 'app-title' }, h('a', { href: `#/companies/${c.id}` }, c.companyName), ' ', c.isDemo && demoBadge()),
        h('p', { class: 'muted small' }, `${c.contactName} · `, bdi(c.email, 'ltr'), ` · ${c.industry || '—'} · ${c.city || '—'} · ${c.taskCount} مهمة`),
        c.bio && h('p', { class: 'prose small' }, c.bio),
        c.verificationNote && h('p', { class: 'small muted' }, `ملاحظة سابقة: ${c.verificationNote}`)),
      h('div', { class: 'app-side' },
        badge({ unverified: 'غير موثّقة', pending: 'قيد المراجعة', verified: 'موثّقة', rejected: 'مرفوضة' }[c.verificationStatus], { pending: 'warn', verified: 'ok', rejected: 'danger' }[c.verificationStatus] || 'muted'),
        !c.emailVerified && badge('البريد غير مؤكد', 'warn'),
        c.verificationStatus !== 'verified' && h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: decide(c, 'verified') }, 'توثيق'),
        c.verificationStatus === 'pending' && h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: decide(c, 'rejected') }, 'رفض')))))
      : emptyState({ ico: 'building', title: 'لا توجد شركات بهذه الحالة' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go('/admin/companies', { status, page: p }) }));
}

const TARGET_LINK = { task: (id) => `#/tasks/${id}`, project: (id) => `#/projects/${id}`, user: (id) => `#/admin/audit?entityId=${id}` };

export async function reports({ query }) {
  const status = query.has('status') ? query.get('status') : 'open';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/reports', { status, page });
  const resolve = (r, outcome) => async () => {
    const res = await askReason(outcome === 'resolved' ? 'معالجة البلاغ' : 'رفض البلاغ', 'تصل نتيجة المراجعة إلى المبلِّغ. نفّذ الإجراء المطلوب (إخفاء مهمة، إيقاف حساب، إلغاء مشروع) من صفحته قبل إغلاق البلاغ.', { label: 'ملاحظة القرار', submitLabel: 'حفظ القرار' });
    if (!res) return;
    try { await api.post(`/admin/reports/${r.id}/resolve`, { status: outcome, note: res.reason }); toast('أُغلق البلاغ.'); refresh(); } catch (err) { reportError(err); }
  };
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'البلاغات', subtitle: 'بلاغات المستخدمين عن المهام والحسابات والنزاعات في المشاريع.' }),
    filterBar(labeled('الحالة', select({ value: status, onchange: (e) => go('/admin/reports', { status: e.target.value || 'all' }) }, [['open', 'مفتوحة'], ['resolved', 'معالجة'], ['dismissed', 'مرفوضة']], 'الكل'))),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((r) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('p', null, badge(REASON_LABEL[r.reason], r.reason === 'dispute' ? 'warn' : 'muted'), ' ', badge({ task: 'مهمة', user: 'حساب', project: 'مشروع' }[r.targetType], 'cat')),
        h('h2', { class: 'app-title' }, h('a', { href: (TARGET_LINK[r.targetType] || (() => '#/admin'))(r.targetId) }, r.targetLabel || r.targetId)),
        h('p', { class: 'prose small' }, r.details),
        h('p', { class: 'muted small' }, 'من ', bdi(r.reporterEmail, 'ltr'), ` · ${fmtRelative(r.createdAt)}`),
        r.resolutionNote && h('p', { class: 'small muted' }, `القرار: ${r.resolutionNote}`)),
      h('div', { class: 'app-side' },
        badge({ open: 'مفتوح', resolved: 'معالج', dismissed: 'مرفوض' }[r.status], r.status === 'open' ? 'warn' : 'muted'),
        r.status === 'open' && h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: resolve(r, 'resolved') }, 'معالجة'),
        r.status === 'open' && h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: resolve(r, 'dismissed') }, 'رفض')))))
      : emptyState({ ico: 'alert', title: 'لا توجد بلاغات بهذه الحالة' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go('/admin/reports', { status, page: p }) }));
}

export async function tasks({ query }) {
  const moderation = query.get('moderation') || '';
  const q = query.get('q') || '';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/tasks', { moderation, q, page });
  const moderate = (t, action) => async () => {
    const res = await askReason(action === 'hide' ? `إخفاء «${t.title}»` : `إظهار «${t.title}»`, action === 'hide' ? 'تختفي المهمة من صفحة الاستكشاف ويصل السبب إلى الشركة.' : 'تعود المهمة للظهور إذا كانت منشورة.', { submitLabel: action === 'hide' ? 'إخفاء المهمة' : 'إظهار المهمة', danger: action === 'hide' });
    if (!res) return;
    try { await api.post(`/admin/tasks/${t.id}/moderation`, { action, reason: res.reason }); toast('حُفظ الإجراء.'); refresh(); } catch (err) { reportError(err); }
  };
  const search = input({ type: 'search', value: q, placeholder: 'عنوان المهمة أو الشركة', 'aria-label': 'بحث' });
  search.addEventListener('change', () => go('/admin/tasks', { moderation, q: search.value.trim() }));
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'إدارة المهام', subtitle: 'المهام التي عليها بلاغات مفتوحة تظهر أولاً.' }),
    filterBar(labeled('بحث', search), labeled('الظهور', select({ value: moderation, onchange: (e) => go('/admin/tasks', { moderation: e.target.value, q }) }, [['visible', 'ظاهرة'], ['hidden', 'مخفية']], 'الكل'))),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((t) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('h2', { class: 'app-title' }, t.title),
        h('p', { class: 'muted small' }, `${t.companyName} · `, bdi(fmtJOD(t.budget)), ` · ${fmtRelative(t.createdAt)}`),
        t.moderationReason && h('p', { class: 'small danger-text' }, `سبب الإخفاء: ${t.moderationReason}`)),
      h('div', { class: 'app-side' },
        statusBadge(TASK_STATUS, t.status),
        t.openReports > 0 && badge(`${t.openReports} بلاغ مفتوح`, 'warn'),
        t.moderationStatus === 'visible'
          ? h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: moderate(t, 'hide') }, 'إخفاء')
          : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: moderate(t, 'unhide') }, 'إظهار'),
        h('a', { class: 'btn btn-text btn-sm', href: `#/admin/audit?entityId=${t.id}` }, 'السجل')))))
      : emptyState({ ico: 'briefcase', title: 'لا توجد مهام مطابقة' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go('/admin/tasks', { moderation, q, page: p }) }));
}

export async function users({ query }) {
  const role = query.get('role') || '';
  const status = query.get('status') || '';
  const q = query.get('q') || '';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/users', { role, status, q, page });
  const act = (u, action) => async () => {
    const res = await askReason(action === 'suspend' ? `إيقاف حساب ${u.name}` : `إعادة تفعيل ${u.name}`,
      action === 'suspend' ? 'يُسجَّل خروج المستخدم من كل الأجهزة فوراً ولا يستطيع الدخول حتى إعادة التفعيل.' : 'يستطيع المستخدم تسجيل الدخول مجدداً.',
      { submitLabel: action === 'suspend' ? 'إيقاف الحساب' : 'إعادة التفعيل', danger: action === 'suspend' });
    if (!res) return;
    try { await api.post(`/admin/users/${u.id}/${action === 'suspend' ? 'suspend' : 'reinstate'}`, { reason: res.reason }); toast('حُفظ الإجراء.'); refresh(); } catch (err) { reportError(err); }
  };
  const search = input({ type: 'search', value: q, placeholder: 'البريد أو الاسم', 'aria-label': 'بحث' });
  search.addEventListener('change', () => go('/admin/users', { role, status, q: search.value.trim() }));
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'المستخدمون' }),
    filterBar(labeled('بحث', search),
      labeled('النوع', select({ value: role, onchange: (e) => go('/admin/users', { role: e.target.value, status, q }) }, [['student', 'طلاب'], ['company', 'شركات'], ['admin', 'إدارة']], 'الكل')),
      labeled('الحالة', select({ value: status, onchange: (e) => go('/admin/users', { role, status: e.target.value, q }) }, [['active', 'نشط'], ['suspended', 'موقوف']], 'الكل'))),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((u) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('h2', { class: 'app-title' }, u.role === 'student' ? h('a', { href: `#/students/${u.id}` }, u.name) : u.role === 'company' ? h('a', { href: `#/companies/${u.id}` }, u.name) : u.name, ' ', u.isDemo && demoBadge()),
        h('p', { class: 'muted small' }, bdi(u.email, 'ltr'), ` · ${{ student: 'طالب', company: 'شركة', admin: 'إدارة' }[u.role]} · انضم ${fmtRelative(u.createdAt)}`),
        u.suspendedReason && h('p', { class: 'small danger-text' }, `سبب الإيقاف: ${u.suspendedReason}`)),
      h('div', { class: 'app-side' },
        badge(u.status === 'active' ? 'نشط' : 'موقوف', u.status === 'active' ? 'ok' : 'danger'),
        !u.emailVerified && badge('البريد غير مؤكد', 'warn'),
        u.role !== 'admin' && (u.status === 'active'
          ? h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: act(u, 'suspend') }, 'إيقاف')
          : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: act(u, 'reinstate') }, 'إعادة التفعيل')),
        h('a', { class: 'btn btn-text btn-sm', href: `#/admin/audit?actorId=${u.id}` }, 'نشاطه')))))
      : emptyState({ ico: 'users', title: 'لا يوجد مستخدمون مطابقون' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go('/admin/users', { role, status, q, page: p }) }));
}

export async function projects({ query }) {
  const disputed = query.get('disputed') === '1';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/projects', { disputed: disputed ? '1' : '', page });
  const cancel = (p) => async () => {
    const res = await askReason(`إلغاء مشروع «${p.title}»`, 'لحل نزاع: يُلغى المشروع والمهمة، ويُلغى سجل الدفع إن لم تُنقل أموال. يصل السبب إلى الطرفين.', { submitLabel: 'إلغاء المشروع', danger: true });
    if (!res) return;
    try { await api.post(`/admin/projects/${p.id}/cancel`, { reason: res.reason }); toast('أُلغي المشروع.'); refresh(); } catch (err) { reportError(err); }
  };
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'المشاريع والنزاعات', subtitle: 'يُسجَّل كل اطلاع إداري على مشروع أو رسائله في سجل التدقيق.' }),
    filterBar(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: disputed, onchange: (e) => go('/admin/projects', { disputed: e.target.checked ? '1' : '' }) }), h('span', null, 'المشاريع التي عليها نزاع مفتوح فقط'))),
    data.items.length ? h('ul', { class: 'app-list' }, data.items.map((p) => h('li', { class: 'app-item card-raised' },
      h('div', { class: 'app-main' },
        h('h2', { class: 'app-title' }, h('a', { href: `#/projects/${p.id}` }, p.title)),
        h('p', { class: 'muted small' }, `${p.studentName} ⇄ ${p.companyName} · بدأ ${fmtRelative(p.startedAt)}`)),
      h('div', { class: 'app-side' },
        statusBadge(PROJECT_STATUS, p.status),
        p.openDisputes > 0 && badge(`${p.openDisputes} نزاع مفتوح`, 'warn'),
        h('a', { class: 'btn btn-ghost btn-sm', href: `#/projects/${p.id}` }, 'فحص'),
        h('a', { class: 'btn btn-text btn-sm', href: `#/admin/audit?entityId=${p.id}` }, 'السجل'),
        ['in_progress', 'awaiting_review', 'revision_requested'].includes(p.status) && h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: cancel(p) }, 'إلغاء')))))
      : emptyState({ ico: 'folder', title: disputed ? 'لا توجد نزاعات مفتوحة' : 'لا توجد مشاريع' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (pg) => go('/admin/projects', { disputed: disputed ? '1' : '', page: pg }) }));
}

export async function audit({ query }) {
  const entityId = query.get('entityId') || '';
  const actorId = query.get('actorId') || '';
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/audit', { entityId, actorId, page, pageSize: 50 });
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'سجل التدقيق', subtitle: entityId ? `لعنصر محدد` : actorId ? 'لمستخدم محدد' : 'أحدث الأحداث. لا يحتوي السجل كلمات مرور أو رموزاً أو نصوص رسائل.' }),
    (entityId || actorId) && h('p', null, h('a', { class: 'btn btn-ghost btn-sm', href: '#/admin/audit' }, 'عرض كل الأحداث')),
    data.items.length ? h('div', { class: 'panel table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['الوقت (عمّان)', 'الفاعل', 'الحدث', 'العنصر', 'تفاصيل'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, data.items.map((a) => h('tr', null,
        h('td', null, fmtDateTime(a.createdAt)),
        h('td', null, a.actorEmail ? bdi(a.actorEmail, 'ltr') : 'النظام'),
        h('td', null, bdi(a.action, 'ltr')),
        h('td', null, a.entityId ? h('a', { href: `#/admin/audit?entityId=${a.entityId}` }, bdi(`${a.entityType}:${a.entityId.slice(0, 8)}`, 'ltr')) : a.entityType),
        h('td', { class: 'mono small' }, bdi(Object.keys(a.metadata || {}).length ? JSON.stringify(a.metadata) : '—', 'ltr')))))))
      : emptyState({ ico: 'history', title: 'لا توجد أحداث' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go('/admin/audit', { entityId, actorId, page: p }) }));
}

export async function payments({ query }) {
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/admin/payments', { page });
  const sandbox = data.provider === 'sandbox';
  const simulate = (p) => async () => {
    const fd = await formDialog({
      title: 'محاكاة حدث من مزوّد الدفع (بيئة تجريبية)',
      description: 'يحاكي هذا ما يرسله مزوّد الدفع عبر webhook. لا تُنقل أي أموال. الانتقالات غير المسموحة تُرفض.',
      fields: [field('الحدث', select({ name: 'type' }, data.sandboxEvents, 'اختر الحدث'))],
      submitLabel: 'إرسال الحدث',
      validate: (f) => ({ type: f.elements.namedItem('type').value ? null : 'اختر الحدث.' }),
    });
    if (!fd) return;
    try { await api.post(`/admin/payments/${p.id}/sandbox-event`, { type: fd.get('type') }); toast('سُجّل الحدث.'); refresh(); } catch (err) { reportError(err); }
  };
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'الإدارة', title: 'المدفوعات', subtitle: 'سجلات الدفع منفصلة عن حالة المشاريع. لا يُعلَّم أي دفع كمدفوع بضغطة زر من المستخدمين.' }),
    note(sandbox
      ? 'مزوّد الدفع: بيئة تجريبية (sandbox). الأحداث هنا محاكاة فقط ولا يوجد نقل أموال حقيقي.'
      : 'لا يوجد مزوّد دفع مفعّل (PAYMENTS_PROVIDER=none). كل السجلات «بانتظار ربط مزوّد الدفع». راجع PAYMENTS-RESEARCH.md لخيارات الأردن.', 'shield'),
    data.items.length ? h('div', { class: 'panel table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['المهمة', 'المبلغ', 'العمولة', 'الحالة', 'آخر تحديث', ''].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, data.items.map((p) => h('tr', null,
        h('td', null, p.projectId ? h('a', { href: `#/projects/${p.projectId}` }, p.title) : p.title),
        h('td', null, bdi(fmtJOD(p.amount))),
        h('td', null, bdi(fmtJOD(p.platformFee))),
        h('td', null, statusBadge(PAYMENT_STATUS, p.status)),
        h('td', null, fmtDateTime(p.updatedAt)),
        h('td', null, sandbox && h('button', { type: 'button', class: 'btn btn-text btn-sm', onclick: simulate(p) }, 'محاكاة حدث')))))))
      : emptyState({ ico: 'wallet', title: 'لا توجد سجلات دفع بعد', text: 'يُنشأ سجل دفع عند بدء كل مشروع.' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => go('/admin/payments', { page: p }) }));
}
