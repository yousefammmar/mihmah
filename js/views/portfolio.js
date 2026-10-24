import { h, fmtDate } from '../dom.js';
import { icon } from '../icons.js';
import { pageHeader, section, emptyState, demoBadge, skillChips, extLink, stars, avatar, badge } from '../ui.js';
import { categoryOf } from './student.js';
import * as store from '../store.js';

export function portfolio({ params }) {
  const s = params.id ? store.studentById(params.id) : store.currentStudent();
  if (!s) return null;
  const sess = store.session();
  const own = sess.role === 'student' && sess.studentId === s.id;
  const completed = store.completedFor(s.id);
  const ratings = completed.map((p) => p.feedback?.rating).filter(Boolean);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';
  const canSeeSummary = (p) => own || (sess.role === 'company' && p.companyId === sess.companyId);

  return h('div', { class: 'page' },
    !own && h('button', { type: 'button', class: 'back-link', onclick: () => history.back() }, icon('chevron-right'), 'رجوع'),
    pageHeader({
      eyebrow: own ? 'ملف الإنجازات' : 'ملف الطالب',
      title: s.name,
      subtitle: `${s.major} · ${s.university}`,
      actions: own && h('a', { class: 'btn btn-ghost', href: '#/settings' }, icon('edit'), 'تعديل الملف'),
    }),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'stack' },
        section(`المشاريع المكتملة (${completed.length})`, completed.length
          ? h('ul', { class: 'portfolio-list' }, completed.map((p) => {
            const t = store.taskById(p.taskId);
            const c = store.companyById(p.companyId);
            const last = p.submissions[p.submissions.length - 1];
            const cat = categoryOf(t.category);
            return h('li', { class: 'portfolio-item card-raised' },
              h('div', { class: 'portfolio-item-head' },
                badge(cat.label, 'cat', cat.icon),
                h('time', { class: 'muted small', datetime: p.completedAt }, `اكتمل في ${fmtDate(p.completedAt)}`)),
              h('h3', { class: 'portfolio-title' }, t.title),
              h('p', { class: 'muted small' }, icon('building'), ` ${c.name} · ${c.city} `, p.demo && demoBadge()),
              skillChips(t.skills),
              p.feedback && h('div', { class: 'feedback' }, stars(p.feedback.rating), h('p', { class: 'prose quote' }, p.feedback.text)),
              last?.links.length > 0 && h('ul', { class: 'link-list' }, last.links.map((l) => h('li', null, extLink(l)))),
              canSeeSummary(p) && h('a', { class: 'btn btn-ghost btn-sm', href: `#/summary/${p.id}` }, icon('printer'), 'ملخص الإنجاز'));
          }))
          : emptyState({
            ico: 'award', title: 'لا توجد مشاريع مكتملة بعد',
            text: own ? 'عندما تعتمد شركة إنجاز مشروعك يُضاف هنا تلقائياً مع تقييمها.' : 'لم يُكمل هذا الطالب مشاريع على المنصة بعد.',
            action: own && h('a', { class: 'btn btn-primary', href: '#/tasks' }, 'استكشف المهام'),
          }),
        { ico: 'award' })),
      h('aside', { class: 'stack', 'aria-label': 'معلومات الطالب' },
        h('div', { class: 'panel profile-card' },
          avatar(s.name, 'avatar-xl'),
          h('p', { class: 'profile-name' }, s.name, ' ', s.demo && demoBadge()),
          h('p', { class: 'muted small' }, icon('graduation'), ` ${s.university}`),
          h('p', { class: 'prose' }, s.bio),
          s.portfolioUrl ? extLink(s.portfolioUrl) : h('p', { class: 'muted small' }, 'لا يوجد رابط أعمال.')),
        h('div', { class: 'panel' },
          h('div', { class: 'mini-stats' },
            h('div', null, h('strong', null, String(completed.length)), h('span', null, 'مشاريع مكتملة')),
            h('div', null, h('strong', null, avg), h('span', null, 'متوسط التقييم')))),
        section('المهارات', skillChips(s.skills), { ico: 'code' }))));
}
