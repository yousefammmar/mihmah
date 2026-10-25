// Settings (profile, password, sessions, notification preferences, company verification) and notifications.
import { h, bdi, fmtDateTime, fmtRelative, isUrl } from '../dom.js';
import { icon } from '../icons.js';
import { UNIVERSITIES, CITIES, INDUSTRIES, SKILL_SUGGESTIONS } from '../data.js';
import {
  pageHeader, section, emptyState, toast, confirmDialog, note, field, input, textarea, select, showErrors, serverErrors,
  liveClear, busy, reportError, skillChips, pager, badge,
} from '../ui.js';
import { api, session, applySession } from '../api.js';
import { navigate, refresh } from '../router.js';
import { notificationRow } from './common.js';
import { ROLE_LABEL } from '../shell.js';

// ---------- skills input (shared with the task editor) ----------
export function parseSkills(text) {
  const seen = new Set();
  return String(text).split(/[,،\n]/).map((s) => s.trim()).filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}

export function skillsField(name, value, label, hint) {
  const ctrl = input({ name, value: value.join('، '), dir: 'auto', placeholder: 'مثال: Figma، HTML، Excel', autocomplete: 'off' });
  const preview = h('div', { class: 'skills-preview', 'aria-live': 'polite' });
  const paint = () => {
    const list = parseSkills(ctrl.value);
    preview.replaceChildren(list.length ? skillChips(list) : h('span', { class: 'field-hint' }, 'لم تُضف مهارات بعد.'));
  };
  ctrl.addEventListener('input', paint);
  const suggestions = h('div', { class: 'suggest', role: 'group', 'aria-label': 'اقتراحات مهارات' },
    SKILL_SUGGESTIONS.map((s) => h('button', {
      type: 'button', class: 'chip chip-btn',
      onclick: () => {
        const list = parseSkills(ctrl.value);
        if (!list.some((x) => x.toLowerCase() === s.toLowerCase())) list.push(s);
        ctrl.value = parseSkills(list.join(',')).join('، ');
        ctrl.dispatchEvent(new Event('input', { bubbles: true }));
      },
    }, icon('plus'), bdi(s))));
  paint();
  return field(label, h('div', { class: 'skills-input' }, ctrl, preview, suggestions), { hint });
}

// ---------- profile forms ----------
function studentForm(p) {
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('check'), 'حفظ الملف');
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'form-grid' },
      field('الاسم الكامل', input({ name: 'fullName', value: p.fullName || '', autocomplete: 'name', maxlength: 100 })),
      field('الجامعة', h('div', null,
        input({ name: 'university', value: p.university || '', list: 'universities', maxlength: 120 }),
        h('datalist', { id: 'universities' }, UNIVERSITIES.map((u) => h('option', { value: u })))), { hint: 'اختر من القائمة أو اكتب اسم جامعتك.' }),
      field('التخصص', input({ name: 'major', value: p.major || '', maxlength: 120 })),
      field('رابط ملف الأعمال أو GitHub', input({ name: 'portfolioUrl', type: 'url', dir: 'ltr', value: p.portfolioUrl || '', placeholder: 'https://github.com/username', inputmode: 'url' }), { optional: true })),
    skillsField('skills', p.skills || [], 'المهارات', 'افصل بين المهارات بفاصلة، أو اختر من الاقتراحات. حتى 12 مهارة.'),
    field('نبذة تعريفية', textarea({ name: 'bio', value: p.bio || '', maxlength: 1000 }), { hint: 'من 20 إلى 1000 حرف: ماذا تدرس، وما نوع المهام التي تحبها؟' }),
    h('div', { class: 'form-actions' }, submit));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = {
      fullName: form.fullName.value.trim(), university: form.university.value.trim(), major: form.major.value.trim(),
      portfolioUrl: form.portfolioUrl.value.trim() || null, skills: parseSkills(form.skills.value), bio: form.bio.value.trim(),
    };
    const errors = {};
    if (d.fullName.length < 2) errors.fullName = 'اكتب اسمك الكامل.';
    if (d.university.length < 2) errors.university = 'اختر جامعتك أو اكتب اسمها.';
    if (d.major.length < 2) errors.major = 'اكتب تخصصك.';
    if (!d.skills.length) errors.skills = 'أضف مهارة واحدة على الأقل.';
    if (d.portfolioUrl && !isUrl(d.portfolioUrl)) errors.portfolioUrl = 'أدخل رابطاً كاملاً يبدأ بـ https://';
    if (d.bio.length < 20) errors.bio = `النبذة قصيرة: ${d.bio.length} من 20 حرفاً على الأقل.`;
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ الحفظ…', async () => {
        const summary = await api.put('/me/profile', d);
        applySession({ user: summary, csrf: session.csrf });
        toast('حُفظ ملفك.');
      });
    } catch (err) { serverErrors(form, err); }
  });
  return form;
}

function companyForm(p) {
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('check'), 'حفظ الملف');
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'form-grid' },
      field('اسم الشركة أو المشروع', input({ name: 'companyName', value: p.companyName || '', autocomplete: 'organization', maxlength: 120 }), { hint: p.verificationStatus === 'verified' ? 'تغيير الاسم يلغي التوثيق ويتطلب مراجعة جديدة.' : null }),
      field('اسم الشخص المسؤول', input({ name: 'contactName', value: p.contactName || '', autocomplete: 'name', maxlength: 100 })),
      field('القطاع', select({ name: 'industry', value: p.industry || '' }, INDUSTRIES, 'اختر القطاع')),
      field('المدينة', select({ name: 'city', value: p.city || '' }, CITIES, 'اختر المدينة'))),
    field('نبذة عن الشركة', textarea({ name: 'bio', value: p.bio || '', maxlength: 1000 }), { hint: 'من 20 إلى 1000 حرف: ماذا تقدّمون ولمن؟' }),
    h('div', { class: 'form-actions' }, submit));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = { companyName: form.companyName.value.trim(), contactName: form.contactName.value.trim(), industry: form.industry.value, city: form.city.value, bio: form.bio.value.trim() };
    const errors = {};
    if (d.companyName.length < 2) errors.companyName = 'اكتب اسم الشركة.';
    if (d.contactName.length < 2) errors.contactName = 'اكتب اسم المسؤول.';
    if (!d.industry) errors.industry = 'اختر القطاع.';
    if (!d.city) errors.city = 'اختر المدينة.';
    if (d.bio.length < 20) errors.bio = `النبذة قصيرة: ${d.bio.length} من 20 حرفاً على الأقل.`;
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ الحفظ…', async () => {
        const summary = await api.put('/me/profile', d);
        applySession({ user: summary, csrf: session.csrf });
        toast('حُفظ ملف الشركة.');
        refresh();
      });
    } catch (err) { serverErrors(form, err); }
  });
  return form;
}

const VERIFY_TEXT = {
  unverified: ['غير موثّقة', 'muted', 'يمكنك طلب التوثيق بعد إكمال الملف. تراجع الإدارة بيانات الشركة قبل إظهار شارة «شركة موثّقة».'],
  pending: ['قيد المراجعة', 'warn', 'طلبك قيد المراجعة من الإدارة. لن تظهر الشارة قبل اكتمال المراجعة.'],
  verified: ['موثّقة', 'ok', 'تحققت الإدارة من بيانات الشركة وتظهر شارة «شركة موثّقة» على مهامك.'],
  rejected: ['لم يُقبل التوثيق', 'danger', 'راجع ملاحظة الإدارة أدناه وحدّث ملفك ثم أعد الطلب.'],
};

function verificationPanel(p) {
  const [label, tone, text] = VERIFY_TEXT[p.verificationStatus];
  const canRequest = ['unverified', 'rejected'].includes(p.verificationStatus);
  return section('توثيق الشركة', h('div', { class: 'stack-sm' },
    h('p', null, 'الحالة: ', badge(label, tone)),
    h('p', { class: 'muted small' }, text),
    p.verificationNote && h('p', { class: 'prose quote' }, p.verificationNote),
    canRequest && h('button', {
      type: 'button', class: 'btn btn-ghost', onclick: async (e) => {
        try { await busy(e.currentTarget, 'جارٍ الإرسال…', () => api.post('/me/verification-request')); toast('أُرسل طلب التوثيق إلى الإدارة.'); refresh(); } catch (err) { reportError(err); }
      },
    }, icon('shield'), 'طلب التوثيق')), { ico: 'shield' });
}

function passwordPanel() {
  const submit = h('button', { type: 'submit', class: 'btn btn-ghost' }, 'تغيير كلمة المرور');
  const form = h('form', { class: 'stack-sm', novalidate: true },
    field('كلمة المرور الحالية', input({ name: 'currentPassword', type: 'password', autocomplete: 'current-password' })),
    field('كلمة المرور الجديدة', input({ name: 'newPassword', type: 'password', autocomplete: 'new-password', minlength: 10 }), { hint: '10 أحرف على الأقل. ستُغلق جلساتك على الأجهزة الأخرى.' }),
    submit);
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value };
    if (!showErrors(form, { currentPassword: body.currentPassword ? null : 'أدخل كلمة المرور الحالية.', newPassword: body.newPassword.length >= 10 ? null : '10 أحرف على الأقل.' })) return;
    try {
      await busy(submit, 'جارٍ الحفظ…', () => api.post('/auth/change-password', body));
      form.reset();
      toast('تم تغيير كلمة المرور وأُغلقت الجلسات الأخرى.');
    } catch (err) { serverErrors(form, err); }
  });
  return section('كلمة المرور', form, { ico: 'shield' });
}

async function sessionsPanel() {
  const { items } = await api.get('/auth/sessions');
  const device = (ua) => (/mobile|android|iphone/i.test(ua || '') ? 'هاتف' : 'متصفح') + (ua ? ` · ${(ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/) || [''])[0]}` : '');
  return section('الجلسات النشطة', h('div', { class: 'stack-sm' },
    h('ul', { class: 'rows' }, items.map((s) => h('li', { class: 'row-static' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, device(s.userAgent), s.current && ' (هذا الجهاز)'),
        h('span', { class: 'row-sub' }, `آخر نشاط ${fmtRelative(s.lastSeenAt)} · تنتهي ${fmtDateTime(s.expiresAt)}`)),
      !s.current && h('button', {
        type: 'button', class: 'btn btn-text btn-sm', onclick: async () => {
          try { await api.del(`/auth/sessions/${s.id}`); toast('أُنهيت الجلسة.', 'info'); refresh(); } catch (err) { reportError(err); }
        },
      }, 'إنهاء')))),
    items.length > 1 && h('button', {
      type: 'button', class: 'btn btn-ghost btn-block', onclick: async () => {
        if (!await confirmDialog({ title: 'تسجيل الخروج من الأجهزة الأخرى؟', body: h('p', null, 'ستبقى مسجّلاً على هذا الجهاز فقط.'), confirmLabel: 'تسجيل الخروج منها', danger: true })) return;
        try { await api.post('/auth/logout-others'); toast('أُغلقت الجلسات الأخرى.'); refresh(); } catch (err) { reportError(err); }
      },
    }, icon('logout'), 'تسجيل الخروج من الأجهزة الأخرى')), { ico: 'users' });
}

async function prefsPanel() {
  const prefs = await api.get('/me/notification-preferences');
  const rows = [['applications', 'الطلبات (وصول طلب، قرار على طلبك)'], ['offers', 'العروض (إرسال، قبول، اعتذار، سحب)'], ['projects', 'المشاريع (تسليم، تعديل، اعتماد)'], ['messages', 'الرسائل الجديدة']];
  const form = h('form', { class: 'stack-sm' },
    h('p', { class: 'muted small' }, 'تصلك الإشعارات داخل المنصة دائماً. اختر ما يصلك أيضاً على بريدك المؤكَّد:'),
    rows.map(([k, label]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: k, checked: prefs[k] }), h('span', null, label))));
  form.addEventListener('change', async () => {
    const body = Object.fromEntries(rows.map(([k]) => [k, form[k].checked]));
    try { await api.put('/me/notification-preferences', body); toast('حُفظت تفضيلات الإشعارات.', 'info'); } catch (err) { reportError(err); }
  });
  return section('إشعارات البريد', form, { ico: 'bell' });
}

export async function settings() {
  const user = session.user;
  const profile = await api.get('/me/profile');
  const [sessions, prefs] = await Promise.all([sessionsPanel(), prefsPanel()]);
  const mainPanel = user.role === 'student' ? section('ملف الطالب', studentForm(profile), { ico: 'user' })
    : user.role === 'company' ? section('ملف الشركة', companyForm(profile), { ico: 'building' })
      : section('حساب الإدارة', h('p', { class: 'muted' }, `مسجّل الدخول بـ ${user.email}. حسابات الإدارة تُنشأ من الخادم فقط.`), { ico: 'shield' });
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: ROLE_LABEL[user.role], title: 'الإعدادات', subtitle: user.email }),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'stack' }, mainPanel, user.role === 'company' && verificationPanel(profile)),
      h('div', { class: 'stack' },
        section('البريد الإلكتروني', h('div', { class: 'stack-sm' },
          h('p', null, bdi(user.email, 'ltr'), ' ', user.emailVerified ? badge('مؤكَّد', 'ok') : badge('غير مؤكَّد', 'warn')),
          !user.emailVerified && h('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', onclick: async (e) => {
              try { await busy(e.currentTarget, 'جارٍ الإرسال…', () => api.post('/auth/resend-verification')); toast('أرسلنا رابط التأكيد مجدداً.', 'info'); } catch (err) { reportError(err); }
            },
          }, 'إعادة إرسال رابط التأكيد'),
          session.mailPreview && note(`بيئة تطوير: الرسائل محفوظة محلياً في ${session.mailPreview}`, 'info')), { ico: 'inbox' }),
        prefs, passwordPanel(), sessions)));
}

// ---------- notifications ----------
export async function notifications({ query }) {
  const page = Number(query.get('page')) || 1;
  const data = await api.get('/notifications', { page, pageSize: 20 });
  return h('div', { class: 'page narrow-wide' },
    pageHeader({
      eyebrow: ROLE_LABEL[session.user.role], title: 'الإشعارات',
      subtitle: 'تُسجَّل الإشعارات عند كل إجراء فعلي: الطلبات، العروض، التسليمات، المراجعات والرسائل. تصل الجديدة مباشرة دون إعادة تحميل.',
      actions: data.unread > 0 && h('button', {
        type: 'button', class: 'btn btn-ghost', id: 'mark-read', onclick: async () => {
          try { await api.post('/notifications/read-all'); toast('حُدّدت كل الإشعارات كمقروءة.', 'info'); refresh(); } catch (err) { reportError(err); }
        },
      }, icon('check'), `تحديد الكل كمقروء (${data.unread})`),
    }),
    data.items.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows' }, data.items.map(notificationRow)))
      : emptyState({ ico: 'bell', title: 'لا توجد إشعارات بعد', text: 'ستظهر هنا عند التقديم أو استلام العروض أو تحديثات المشاريع.' }),
    pager({ page: data.page, pages: data.pages, total: data.total, onPage: (p) => navigate(`/notifications?page=${p}`) }));
}
