// Student portfolio (own or viewed by a company/admin) and public company profile.
import { h, fmtDate } from '../dom.js';
import { icon } from '../icons.js';
import { categoryOf } from '../data.js';
import { pageHeader, section, emptyState, demoBadge, skillChips, extLink, stars, avatar, badge, verifiedBadge } from '../ui.js';
import { api, session } from '../api.js';
import { reportDialog } from './student.js';

export async function portfolio({ params }) {
  const own = !params.id || params.id === session.user.id;
  const s = own && session.user.role === 'student' ? await api.get('/me/profile') : await api.get(`/students/${params.id}`);
  return h('div', { class: 'page' },
    !own && h('button', { type: 'button', class: 'back-link', onclick: () => history.back() }, icon('chevron-right'), 'رجوع'),
    pageHeader({
      eyebrow: own ? 'ملف الإنجازات' : 'ملف الطالب', title: s.fullName,
      subtitle: [s.major, s.university].filter(Boolean).join(' · ') || 'لم يُكمل الملف بعد',
      actions: own
        ? h('a', { class: 'btn btn-ghost', href: '#/settings' }, icon('edit'), 'تعديل الملف')
        : h('button', { type: 'button', class: 'btn btn-text', onclick: () => reportDialog('user', s.id) }, icon('alert'), 'إبلاغ'),
    }),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'stack' },
        section(`المشاريع المكتملة (${s.projects.length})`, s.projects.length
          ? h('ul', { class: 'portfolio-list' }, s.projects.map((p) => {
            const cat = categoryOf(p.category);
            return h('li', { class: 'portfolio-item card-raised' },
              h('div', { class: 'portfolio-item-head' }, badge(cat.label, 'cat', cat.icon),
                h('time', { class: 'muted small', datetime: p.completedAt }, `اكتمل في ${fmtDate(p.completedAt)}`)),
              h('h3', { class: 'portfolio-title' }, p.title),
              h('p', { class: 'muted small' }, icon('building'), ` ${p.companyName}${p.city ? ` · ${p.city}` : ''}`),
              skillChips(p.skills),
              p.rating && h('div', { class: 'feedback' }, stars(p.rating), h('p', { class: 'prose quote' }, p.comment)),
              p.links?.length > 0 && h('ul', { class: 'link-list' }, p.links.map((l) => h('li', null, extLink(l)))),
              own && h('a', { class: 'btn btn-ghost btn-sm', href: `#/summary/${p.id}` }, icon('printer'), 'ملخص الإنجاز'));
          }))
          : emptyState({
            ico: 'award', title: 'لا توجد مشاريع مكتملة بعد',
            text: own ? 'عندما تعتمد شركة إنجاز مشروعك يُضاف هنا تلقائياً مع تقييمها.' : 'لم يُكمل هذا الطالب مشاريع على المنصة بعد.',
            action: own && h('a', { class: 'btn btn-primary', href: '#/tasks' }, 'استكشف المهام'),
          }),
        { ico: 'award' })),
      h('aside', { class: 'stack', 'aria-label': 'معلومات الطالب' },
        h('div', { class: 'panel profile-card' },
          avatar(s.fullName, 'avatar-xl'),
          h('p', { class: 'profile-name' }, s.fullName, ' ', s.isDemo && demoBadge()),
          s.university && h('p', { class: 'muted small' }, icon('graduation'), ` ${s.university}`),
          s.emailVerified && h('p', null, badge('البريد مؤكَّد', 'ok', 'check')),
          s.bio ? h('p', { class: 'prose' }, s.bio) : h('p', { class: 'muted small' }, 'لا توجد نبذة.'),
          s.portfolioUrl ? extLink(s.portfolioUrl) : h('p', { class: 'muted small' }, 'لا يوجد رابط أعمال.')),
        h('div', { class: 'panel' }, h('div', { class: 'mini-stats' },
          h('div', null, h('strong', null, String(s.projects.length)), h('span', null, 'مشاريع مكتملة')),
          h('div', null, h('strong', null, s.averageRating ?? '—'), h('span', null, 'متوسط التقييم')))),
        section('المهارات', s.skills.length ? skillChips(s.skills) : h('p', { class: 'muted small' }, 'لم تُضف مهارات.'), { ico: 'code' }),
        h('p', { class: 'field-hint' }, 'تظهر شارة «البريد مؤكَّد» بعد تأكيد البريد فقط. لا تتحقق المنصة حالياً من التسجيل الجامعي.'))));
}

export async function companyProfile({ params }) {
  const c = await api.get(`/companies/${params.id}`);
  return h('div', { class: 'page narrow-wide' },
    h('button', { type: 'button', class: 'back-link', onclick: () => history.back() }, icon('chevron-right'), 'رجوع'),
    pageHeader({
      eyebrow: 'ملف الشركة', title: c.companyName, subtitle: [c.industry, c.city].filter(Boolean).join(' · '),
      actions: session.user.id !== c.id && h('button', { type: 'button', class: 'btn btn-text', onclick: () => reportDialog('user', c.id) }, icon('alert'), 'إبلاغ'),
    }),
    h('div', { class: 'panel stack-sm' },
      h('p', null, c.verified ? verifiedBadge() : badge('غير موثّقة', 'muted'), ' ', c.isDemo && demoBadge()),
      c.bio ? h('p', { class: 'prose' }, c.bio) : h('p', { class: 'muted' }, 'لا توجد نبذة.'),
      h('div', { class: 'mini-stats' },
        h('div', null, h('strong', null, String(c.taskCount)), h('span', null, 'مهام منشورة')),
        h('div', null, h('strong', null, c.averageRating ?? '—'), h('span', null, 'تقييم الطلاب'))),
      h('p', { class: 'field-hint' }, 'تظهر شارة «شركة موثّقة» فقط بعد أن تراجع إدارة المنصة بيانات الشركة وتعتمدها.')));
}
