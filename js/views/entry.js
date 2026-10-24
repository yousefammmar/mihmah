// Demo entry, onboarding and the shared profile form (also used by settings).
import { h, bdi, isUrl } from '../dom.js';
import { icon } from '../icons.js';
import { UNIVERSITIES, CITIES, INDUSTRIES, SKILL_SUGGESTIONS } from '../data.js';
import { field, input, textarea, select, showErrors, liveClear, toast, note, skillChips } from '../ui.js';
import { navigate } from '../router.js';
import { HOME } from '../shell.js';
import * as store from '../store.js';

const STUDENT_ONLY = ['/student', '/tasks', '/applications', '/portfolio'];

// Sends the user to `next` only if it belongs to the role they just entered as.
export function nextFor(r, next) {
  if (!next || !next.startsWith('/')) return HOME[r];
  if (next.startsWith('/company')) return r === 'company' ? next : HOME[r];
  if (STUDENT_ONLY.some((p) => next === p || next.startsWith(`${p}/`))) return r === 'student' ? next : HOME[r];
  return next;
}

export function start({ query }) {
  const next = query.get('next') || '';
  const prefer = next.startsWith('/company') ? 'company' : next ? 'student' : null;
  const demoStudent = store.studentById('s-demo');
  const demoCompany = store.companyById('c-demo');
  const qs = next ? `?next=${encodeURIComponent(next)}` : '';

  const card = (r, ico, title, text, who, enterLabel, newLabel) => h('section', { class: `entry-card card-raised${prefer === r ? ' is-preferred' : ''}`, 'aria-labelledby': `entry-${r}` },
    h('span', { class: 'entry-icon' }, icon(ico)),
    h('h2', { id: `entry-${r}`, class: 'entry-title' }, title),
    h('p', { class: 'muted' }, text),
    h('p', { class: 'entry-who' }, icon('user'), h('span', null, 'الحساب التجريبي: ', h('strong', null, who))),
    h('button', { type: 'button', class: 'btn btn-primary btn-block btn-lg', onclick: () => {
      navigate(nextFor(r, next));
      store.enterDemo(r);
      toast(r === 'student' ? 'دخلت كطالب تجريبي.' : 'دخلت كشركة تجريبية.', 'info');
    } }, enterLabel),
    h('a', { class: 'btn btn-ghost btn-block', href: `#/onboarding/${r}${qs}` }, icon('edit'), newLabel));

  return h('div', { class: 'container page entry' },
    h('header', { class: 'entry-head' },
      h('p', { class: 'eyebrow' }, 'الدخول التجريبي'),
      h('h1', { class: 'page-title', tabindex: '-1', 'data-page-title': true }, 'كيف تريد تجربة مهمّة؟'),
      h('p', { class: 'page-sub' }, 'اختر دوراً للبدء. يمكنك التبديل بين الطالب والشركة في أي وقت لتجربة الرحلة من الطرفين.')),
    h('div', { class: 'entry-grid' },
      card('student', 'graduation', 'أنا طالب جامعي', 'استكشف المهام، تقدّم بعرضك، نفّذ المشروع وابنِ ملف إنجازاتك.',
        `${demoStudent?.name} · ${demoStudent?.university}`, 'الدخول كطالب تجريبي', 'إنشاء ملف طالب جديد'),
      card('company', 'building', 'أنا شركة أو مشروع صغير', 'انشر مهمّة، راجع المتقدّمين، اختر طالباً وتابع التسليم حتى الاعتماد.',
        `${demoCompany?.name} · ${demoCompany?.city}`, 'الدخول كشركة تجريبية', 'إنشاء ملف شركة جديد')),
    note('دخول محاكى: لا توجد كلمات مرور أو حسابات حقيقية. تُحفظ البيانات في هذا المتصفح فقط، ويمكن إعادة ضبطها من الإعدادات.', 'shield'));
}

export function onboarding({ params, query }) {
  const r = params.role;
  if (r !== 'student' && r !== 'company') return null;
  const next = query.get('next') || '';
  const form = profileForm(r, {}, {
    submitLabel: 'حفظ والمتابعة',
    onSubmit: (data) => {
      navigate(nextFor(r, next));
      store.createProfile(r, data);
      toast('تم إنشاء ملفك التجريبي.');
    },
  });
  return h('div', { class: 'container page narrow' },
    h('a', { class: 'back-link', href: `#/start${next ? `?next=${encodeURIComponent(next)}` : ''}` }, icon('chevron-right'), 'العودة لاختيار الدور'),
    h('header', { class: 'page-head' }, h('div', null,
      h('p', { class: 'eyebrow' }, r === 'student' ? 'ملف طالب تجريبي' : 'ملف شركة تجريبي'),
      h('h1', { class: 'page-title', tabindex: '-1', 'data-page-title': true }, r === 'student' ? 'عرّفنا بنفسك' : 'عرّفنا بشركتك'),
      h('p', { class: 'page-sub' }, 'يُنشئ هذا النموذج ملفاً تجريبياً في متصفحك فقط، ويمكنك تعديله لاحقاً من الإعدادات.'))),
    h('div', { class: 'panel' }, form));
}

// ---------- skills input ----------
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
  const refresh = () => {
    const list = parseSkills(ctrl.value);
    preview.replaceChildren(list.length ? skillChips(list) : h('span', { class: 'field-hint' }, 'لم تُضف مهارات بعد.'));
  };
  ctrl.addEventListener('input', refresh);
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
  refresh();
  return field(label, h('div', { class: 'skills-input' }, ctrl, preview, suggestions), { hint });
}

// ---------- profile form ----------
export function profileForm(r, initial, { submitLabel, onSubmit }) {
  const v = (k) => initial[k] ?? '';
  const fields = r === 'student' ? [
    h('div', { class: 'form-grid' },
      field('الاسم الكامل', input({ name: 'name', value: v('name'), autocomplete: 'name' })),
      field('الجامعة', h('div', null,
        input({ name: 'university', value: v('university'), list: 'universities' }),
        h('datalist', { id: 'universities' }, UNIVERSITIES.map((u) => h('option', { value: u })))), { hint: 'اختر من القائمة أو اكتب اسم جامعتك.' }),
      field('التخصص', input({ name: 'major', value: v('major') })),
      field('رابط ملف الأعمال أو GitHub', input({ name: 'portfolioUrl', type: 'url', dir: 'ltr', value: v('portfolioUrl'), placeholder: 'https://github.com/username', inputmode: 'url' }), { optional: true })),
    skillsField('skills', initial.skills || [], 'المهارات', 'افصل بين المهارات بفاصلة، أو اختر من الاقتراحات. حتى 12 مهارة.'),
    field('نبذة تعريفية', textarea({ name: 'bio', value: v('bio'), maxlength: 400 }), { hint: 'من 20 إلى 400 حرف: ماذا تدرس، وما نوع المهام التي تحبها؟' }),
  ] : [
    h('div', { class: 'form-grid' },
      field('اسم الشخص المسؤول', input({ name: 'contactName', value: v('contactName'), autocomplete: 'name' })),
      field('اسم الشركة أو المشروع', input({ name: 'name', value: v('name'), autocomplete: 'organization' })),
      field('القطاع', select({ name: 'industry', value: v('industry') }, INDUSTRIES, 'اختر القطاع')),
      field('المدينة', select({ name: 'city', value: v('city') }, CITIES, 'اختر المدينة'))),
    field('نبذة عن الشركة', textarea({ name: 'bio', value: v('bio'), maxlength: 400 }), { hint: 'من 20 إلى 400 حرف: ماذا تقدّمون ولمن؟' }),
  ];

  const form = h('form', { class: 'stack', novalidate: true }, fields,
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, icon('check'), submitLabel)));
  liveClear(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const get = (k) => String(fd.get(k) || '').trim();
    const errors = {};
    let data;
    if (r === 'student') {
      data = { name: get('name'), university: get('university'), major: get('major'), skills: parseSkills(get('skills')), bio: get('bio'), portfolioUrl: get('portfolioUrl') };
      if (data.name.length < 3) errors.name = 'اكتب اسمك الكامل (3 أحرف على الأقل).';
      if (!data.university) errors.university = 'اختر جامعتك أو اكتب اسمها.';
      if (data.major.length < 2) errors.major = 'اكتب تخصصك.';
      if (!data.skills.length) errors.skills = 'أضف مهارة واحدة على الأقل.';
      if (data.portfolioUrl && !isUrl(data.portfolioUrl)) errors.portfolioUrl = 'أدخل رابطاً كاملاً يبدأ بـ https://';
    } else {
      data = { contactName: get('contactName'), name: get('name'), industry: get('industry'), city: get('city'), bio: get('bio') };
      if (data.contactName.length < 3) errors.contactName = 'اكتب اسم الشخص المسؤول.';
      if (data.name.length < 2) errors.name = 'اكتب اسم الشركة أو المشروع.';
      if (!data.industry) errors.industry = 'اختر القطاع.';
      if (!data.city) errors.city = 'اختر المدينة.';
    }
    if (data.bio.length < 20) errors.bio = `النبذة قصيرة: ${data.bio.length} من 20 حرفاً على الأقل.`;
    if (showErrors(form, errors)) onSubmit(data);
  });
  return form;
}
