import { h } from '../dom.js';
import { icon } from '../icons.js';
import { pageHeader, section, emptyState, toast, confirmDialog, note } from '../ui.js';
import { navigate } from '../router.js';
import { switchTo, ROLE_LABEL, HOME } from '../shell.js';
import { clearFiles } from '../files.js';
import { profileForm } from './entry.js';
import { notificationRow, resetFilters } from './student.js';
import { clearDraft } from './company.js';
import * as store from '../store.js';

export function settings() {
  const r = store.role();
  const user = store.currentUser();
  const other = r === 'student' ? 'company' : 'student';

  const form = profileForm(r, user, {
    submitLabel: 'حفظ التغييرات',
    onSubmit: (data) => { store.updateProfile(data); toast('حُفظت بيانات الملف.'); },
  });

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'إعادة ضبط البيانات التجريبية؟',
      body: h('div', { class: 'stack-sm' },
        h('p', null, 'ستُحذف كل المهام والطلبات والمشاريع والرسائل والملفات التي أنشأتها في هذا المتصفح، وتعود البيانات الأولية.'),
        note('لا يمكن التراجع عن هذه الخطوة.', 'alert')),
      confirmLabel: 'إعادة الضبط',
      danger: true,
    });
    if (!ok) return;
    resetFilters();
    clearDraft();
    try { await clearFiles(); } catch { /* no attachments stored */ }
    store.resetDemo();
    toast('أُعيدت البيانات التجريبية إلى حالتها الأولى.');
    navigate(HOME[store.role()]);
  };

  return h('div', { class: 'page' },
    pageHeader({ eyebrow: ROLE_LABEL[r], title: 'الإعدادات', subtitle: 'عدّل ملفك، بدّل الدور التجريبي، أو أعد ضبط البيانات.' }),
    h('div', { class: 'detail-grid' },
      section(r === 'student' ? 'ملف الطالب' : 'ملف الشركة', form, { ico: 'user' }),
      h('div', { class: 'stack' },
        section('الدور التجريبي', h('div', { class: 'stack-sm' },
          h('p', null, 'أنت الآن في وضع ', h('strong', null, ROLE_LABEL[r]), '.'),
          h('p', { class: 'muted small' }, 'التبديل محاكاة داخل المتصفح نفسه لتجربة الطرفين، وليس تسجيل دخول حقيقياً.'),
          h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => switchTo(other) }, icon('switch'), `التبديل إلى ${ROLE_LABEL[other]}`),
          h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => { navigate('/'); store.exitDemo(); } }, icon('logout'), 'الخروج إلى الصفحة الرئيسية')),
        { ico: 'switch' }),
        section('البيانات المحلية', h('div', { class: 'stack-sm' },
          h('p', { class: 'muted small' }, 'تُحفظ السجلات في localStorage، والملفات المرفقة في IndexedDB على هذا الجهاز فقط. لا تُرسل أي بيانات إلى خادم.'),
          h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: reset }, icon('refresh'), 'إعادة ضبط البيانات التجريبية')),
        { ico: 'shield' }))));
}

export function notifications() {
  const list = store.myNotifications();
  const unread = list.filter((n) => !n.read).length;
  return h('div', { class: 'page narrow-wide' },
    pageHeader({
      eyebrow: ROLE_LABEL[store.role()], title: 'الإشعارات',
      subtitle: 'تنتج الإشعارات عن الإجراءات الفعلية في هذا المتصفح: التقديم، الاختيار، التسليم، طلب التعديل، الاعتماد والرسائل.',
      actions: unread > 0 && h('button', { type: 'button', class: 'btn btn-ghost', id: 'mark-read', onclick: () => { store.markNotificationsRead(); toast('حُدّدت كل الإشعارات كمقروءة.', 'info'); } }, icon('check'), 'تحديد الكل كمقروء'),
    }),
    list.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows' }, list.map(notificationRow)))
      : emptyState({ ico: 'bell', title: 'لا توجد إشعارات بعد', text: 'جرّب التقديم لمهمة أو إرسال رسالة في مشروع، ثم بدّل الدور لترى الإشعار.' }));
}
