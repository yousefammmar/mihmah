// Login, registration, email verification and password reset.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { field, input, liveClear, showErrors, serverErrors, busy, toast, note, reportError } from '../ui.js';
import { api, session, applySession } from '../api.js';
import { navigate } from '../router.js';
import { HOME } from '../shell.js';

const title = (text, sub) => h('header', { class: 'entry-head' },
  h('h1', { class: 'page-title', tabindex: '-1', 'data-page-title': true }, text),
  sub && h('p', { class: 'page-sub' }, sub));

function formError() {
  return h('p', { class: 'form-error', role: 'alert', hidden: true });
}
function setFormError(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }

function passwordInput(props) {
  const inp = input({ type: 'password', minlength: 10, maxlength: 200, ...props });
  const toggle = h('button', {
    type: 'button', class: 'icon-btn pw-toggle', 'aria-label': 'إظهار كلمة المرور', 'aria-pressed': 'false',
    onclick: () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    },
  }, icon('eye'));
  return h('div', { class: 'pw-wrap' }, inp, toggle);
}

const devMailNote = () => session.mailPreview && note(`بيئة تطوير: لا تُرسل رسائل حقيقية. افتح صندوق الرسائل المحلي من ${session.mailPreview}`, 'info');

function demoPanel(next) {
  if (!session.demoMode) return null;
  const go = (account) => async (e) => {
    try {
      await busy(e.currentTarget, 'جارٍ الدخول…', async () => {
        const data = await api.post('/demo/login', { account });
        applySession({ ...data, payments: session.payments });
        navigate(next || HOME[data.user.role]);
      });
    } catch (err) { reportError(err); }
  };
  return h('section', { class: 'panel demo-panel', 'aria-labelledby': 'demo-title' },
    h('h2', { class: 'panel-title', id: 'demo-title' }, icon('shield'), 'بيئة تجريبية'),
    h('p', { class: 'muted small' }, 'هذه البيئة منفصلة وتحتوي بيانات خيالية فقط. اختر حساباً تجريبياً للدخول دون كلمة مرور.'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: go('student') }, icon('graduation'), 'طالب تجريبي'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: go('company') }, icon('building'), 'شركة تجريبية'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: go('admin') }, icon('shield'), 'مسؤول تجريبي')));
}

export function login({ query }) {
  const next = query.get('next');
  const err = formError();
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, 'تسجيل الدخول');
  const form = h('form', { class: 'stack', novalidate: true },
    err,
    field('البريد الإلكتروني', input({ name: 'email', type: 'email', autocomplete: 'email', dir: 'ltr', required: true })),
    field('كلمة المرور', passwordInput({ name: 'password', autocomplete: 'current-password', required: true })),
    submit,
    h('p', { class: 'auth-links' }, h('a', { href: '#/forgot-password' }, 'نسيت كلمة المرور؟'), ' · ', h('a', { href: `#/register${next ? `?next=${encodeURIComponent(next)}` : ''}` }, 'إنشاء حساب جديد')));
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError(err, '');
    const email = form.email.value.trim();
    const password = form.password.value;
    const errors = {};
    if (!email) errors.email = 'أدخل بريدك الإلكتروني.';
    if (!password) errors.password = 'أدخل كلمة المرور.';
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ التحقق…', async () => {
        const data = await api.post('/auth/login', { email, password });
        applySession(data);
        toast(`أهلاً بك، ${data.user.name}.`, 'info');
        navigate(next && next.startsWith('/') ? next : HOME[data.user.role]);
      });
    } catch (ex) {
      if (ex.fields) serverErrors(form, ex);
      else { setFormError(err, ex.message); form.password.focus(); }
    }
  });
  // Two columns only when the demo-accounts panel exists; otherwise the form is centred like the other auth pages.
  const demo = demoPanel(next);
  return h('div', { class: demo ? 'container page auth' : 'container page auth narrow' },
    title('تسجيل الدخول', 'ادخل إلى حسابك في مهمّة.'),
    h('div', { class: demo ? 'auth-grid auth-grid-demo' : 'auth-grid' }, h('div', { class: 'panel' }, form), demo));
}

export function register({ query }) {
  let role = query.get('role') === 'company' ? 'company' : 'student';
  const err = formError();
  const companyField = field('اسم الشركة أو المشروع', input({ name: 'companyName', autocomplete: 'organization', maxlength: 120 }));
  const nameLabel = h('span', null);
  const nameField = field(nameLabel, input({ name: 'name', autocomplete: 'name', maxlength: 100 }));
  const sync = () => {
    companyField.hidden = role !== 'company';
    nameLabel.textContent = role === 'company' ? 'اسم الشخص المسؤول' : 'الاسم الكامل';
  };
  const roleCard = (value, ico, label, desc) => h('label', { class: 'role-card' },
    h('input', { type: 'radio', name: 'role', value, checked: role === value, onchange: () => { role = value; sync(); } }),
    h('span', { class: 'role-card-body' }, h('span', { class: 'role-check', 'aria-hidden': 'true' }, icon('check')),
      h('span', { class: 'entry-icon' }, icon(ico)), h('strong', null, label), h('span', { class: 'muted small' }, desc)));
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, 'إنشاء الحساب');
  const form = h('form', { class: 'stack', novalidate: true },
    err,
    h('fieldset', { class: 'role-pick' },
      h('legend', { class: 'field-label' }, 'نوع الحساب'),
      roleCard('student', 'graduation', 'طالب جامعي', 'أتقدّم للمهام وأبني ملف إنجازاتي'),
      roleCard('company', 'building', 'شركة أو مشروع صغير', 'أنشر مهاماً وأختار الطلاب')),
    companyField, nameField,
    field('البريد الإلكتروني', input({ name: 'email', type: 'email', autocomplete: 'email', dir: 'ltr' }), { hint: 'سنرسل رابط تأكيد إلى هذا البريد.' }),
    field('كلمة المرور', passwordInput({ name: 'password', autocomplete: 'new-password' }), { hint: '10 أحرف على الأقل. يُفضّل استخدام عبارة يسهل تذكرها.' }),
    submit,
    h('p', { class: 'auth-links' }, 'لديك حساب؟ ', h('a', { href: '#/login' }, 'سجّل الدخول')));
  sync();
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError(err, '');
    const body = {
      role, email: form.email.value.trim(), password: form.password.value, name: form.elements.namedItem('name').value.trim(),
      companyName: role === 'company' ? form.companyName.value.trim() : undefined,
    };
    const errors = {};
    if (body.name.length < 2) errors.name = role === 'company' ? 'اكتب اسم الشخص المسؤول.' : 'اكتب اسمك الكامل.';
    if (role === 'company' && (body.companyName || '').length < 2) errors.companyName = 'اكتب اسم الشركة أو المشروع.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) errors.email = 'أدخل بريداً إلكترونياً صحيحاً.';
    if (body.password.length < 10) errors.password = 'كلمة المرور يجب أن تكون 10 أحرف على الأقل.';
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ إنشاء الحساب…', async () => {
        const data = await api.post('/auth/register', body);
        applySession(data);
        toast('تم إنشاء حسابك. أرسلنا رابط تأكيد إلى بريدك؛ أكمل ملفك الآن.', 'info');
        navigate('/settings');
      });
    } catch (ex) {
      if (ex.fields) serverErrors(form, ex);
      else setFormError(err, ex.message);
    }
  });
  return h('div', { class: 'container page auth narrow' },
    title('إنشاء حساب', 'حساب واحد لكل بريد إلكتروني. يمكنك إكمال ملفك بعد التسجيل.'),
    h('div', { class: 'panel' }, form),
    devMailNote());
}

export async function verifyEmail({ query }) {
  const token = query.get('token');
  let state;
  try {
    if (!token) throw new Error('الرابط ناقص.');
    await api.post('/auth/verify-email', { token });
    if (session.user) applySession(await api.get('/auth/session'));
    state = { ok: true };
  } catch (err) { state = { ok: false, message: err.message }; }
  return h('div', { class: 'container page auth narrow' },
    title(state.ok ? 'تم تأكيد بريدك الإلكتروني' : 'تعذّر تأكيد البريد'),
    h('div', { class: 'panel stack-sm' },
      h('p', null, state.ok ? 'شكراً لك. يمكنك الآن التقديم على المهام أو نشرها.' : state.message),
      state.ok
        ? h('a', { class: 'btn btn-primary', href: session.user ? `#${HOME[session.user.role]}` : '#/login' }, session.user ? 'متابعة إلى لوحة التحكم' : 'تسجيل الدخول')
        : h('p', { class: 'muted small' }, 'سجّل الدخول ثم استخدم زر «إعادة إرسال الرابط» في أعلى لوحة التحكم.'),
      !state.ok && h('a', { class: 'btn btn-ghost', href: session.user ? `#${HOME[session.user.role]}` : '#/login' }, 'العودة')));
}

export function forgotPassword() {
  const done = h('div', { class: 'stack-sm', hidden: true, role: 'status' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, 'إرسال رابط إعادة التعيين');
  const form = h('form', { class: 'stack', novalidate: true },
    field('البريد الإلكتروني', input({ name: 'email', type: 'email', autocomplete: 'email', dir: 'ltr' })),
    submit);
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!showErrors(form, { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? null : 'أدخل بريداً إلكترونياً صحيحاً.' })) return;
    try {
      await busy(submit, 'جارٍ الإرسال…', async () => {
        const data = await api.post('/auth/forgot-password', { email });
        form.hidden = true;
        done.replaceChildren(h('p', null, data.message), h('a', { class: 'btn btn-ghost', href: '#/login' }, 'العودة لتسجيل الدخول'));
        done.hidden = false;
      });
    } catch (ex) { serverErrors(form, ex); }
  });
  return h('div', { class: 'container page auth narrow' },
    title('نسيت كلمة المرور', 'أدخل بريدك وسنرسل لك رابطاً صالحاً لمدة ساعة.'),
    h('div', { class: 'panel' }, form, done), devMailNote());
}

export function resetPassword({ query }) {
  const token = query.get('token') || '';
  const err = formError();
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, 'حفظ كلمة المرور الجديدة');
  const form = h('form', { class: 'stack', novalidate: true },
    err,
    field('كلمة المرور الجديدة', passwordInput({ name: 'password', autocomplete: 'new-password' }), { hint: '10 أحرف على الأقل.' }),
    field('تأكيد كلمة المرور', passwordInput({ name: 'confirm', autocomplete: 'new-password' })),
    note('بعد الحفظ سيتم تسجيل خروجك من جميع الأجهزة.', 'shield'),
    submit);
  liveClear(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError(err, '');
    const password = form.password.value;
    const errors = {
      password: password.length < 10 ? 'كلمة المرور يجب أن تكون 10 أحرف على الأقل.' : null,
      confirm: form.confirm.value !== password ? 'كلمتا المرور غير متطابقتين.' : null,
    };
    if (!showErrors(form, errors)) return;
    try {
      await busy(submit, 'جارٍ الحفظ…', async () => {
        await api.post('/auth/reset-password', { token, password });
        applySession({ user: null, csrf: null });
        toast('تم تغيير كلمة المرور. سجّل الدخول بها الآن.');
        navigate('/login');
      });
    } catch (ex) {
      if (ex.fields) serverErrors(form, ex);
      else setFormError(err, ex.message);
    }
  });
  return h('div', { class: 'container page auth narrow' }, title('تعيين كلمة مرور جديدة'), h('div', { class: 'panel' }, form));
}
