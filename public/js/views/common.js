// View pieces shared by student, company and admin pages.
import { h, bdi, fmtJOD, fmtDate, fmtDays, fmtRelative, daysUntil } from '../dom.js';
import { icon } from '../icons.js';
import { categoryOf, APPLICATION_STATUS, PROJECT_STATUS, PAYMENT_STATUS } from '../data.js';
import { badge, statusBadge, demoBadge, skillChips, toast, reportError, verifiedBadge, note } from '../ui.js';
import { api, session } from '../api.js';

export const skillSet = (skills = []) => new Set(skills.map((s) => s.toLowerCase()));

export function deadlineText(iso) {
  const d = daysUntil(iso);
  if (d < 0) return `انتهى في ${fmtDate(iso)}`;
  if (d === 0) return 'التسليم اليوم';
  return `التسليم خلال ${fmtDays(d)}`;
}

// Save toggle updates in place (no page re-render) and rolls back on failure.
export function saveButton(t, { compact = false } = {}) {
  let saved = !!t.saved;
  const btn = h('button', { type: 'button', id: `save-${t.id}`, class: compact ? 'icon-btn save-btn' : 'btn btn-ghost' });
  const paint = () => {
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', String(saved));
    btn.setAttribute('aria-label', saved ? `إزالة «${t.title}» من المحفوظة` : `حفظ «${t.title}»`);
    btn.replaceChildren(icon('bookmark'), ...(compact ? [] : [saved ? 'محفوظة' : 'حفظ']));
  };
  btn.addEventListener('click', async () => {
    saved = !saved;
    paint();
    try {
      await (saved ? api.put(`/tasks/${t.id}/save`) : api.del(`/tasks/${t.id}/save`));
      toast(saved ? 'حُفظت المهمة في قائمتك.' : 'أُزيلت المهمة من المحفوظة.', 'info');
    } catch (err) {
      saved = !saved;
      paint();
      reportError(err);
    }
  });
  paint();
  return btn;
}

export function companyLine(t) {
  return h('p', { class: 'task-card-company' }, icon('building'),
    h('a', { href: `#/companies/${t.companyId}`, class: 'plain-link' }, t.companyName),
    t.companyVerified && verifiedBadge(), t.isDemo && demoBadge(),
    t.companyCity && h('span', { class: 'muted' }, ` · ${t.companyCity}`));
}

export function taskCard(t, { compact = false, mySkills } = {}) {
  const cat = categoryOf(t.category);
  return h('article', { class: 'task-card card-raised', 'aria-labelledby': `tt-${t.id}` },
    h('div', { class: 'task-card-top' }, badge(cat.label, 'cat', cat.icon), session.user?.role === 'student' && saveButton(t, { compact: true })),
    h('h3', { class: 'task-card-title', id: `tt-${t.id}` }, h('a', { href: `#/tasks/${t.id}` }, t.title)),
    companyLine(t),
    !compact && h('p', { class: 'task-card-summary' }, t.summary),
    h('ul', { class: 'meta-row', 'aria-label': 'تفاصيل المهمة' },
      h('li', { class: 'inset-pill pill-accent' }, icon('wallet'), bdi(fmtJOD(t.budget))),
      h('li', { class: 'inset-pill' }, icon('clock'), fmtDays(t.durationDays)),
      h('li', { class: 'inset-pill' }, icon('calendar'), deadlineText(t.deadlineAt))),
    !compact && skillChips(t.skills, mySkills),
    h('div', { class: 'task-card-foot' },
      t.myApplicationStatus ? statusBadge(APPLICATION_STATUS, t.myApplicationStatus) : h('span', { class: 'muted small' }, `نُشرت ${fmtRelative(t.publishedAt)}`),
      h('a', { class: 'btn btn-ghost btn-sm', href: `#/tasks/${t.id}`, 'aria-label': `عرض تفاصيل «${t.title}»` }, 'التفاصيل', icon('chevron-left'))));
}

export function projectRow(p) {
  const other = session.user.role === 'student' ? p.companyName : p.studentName;
  return h('li', null, h('a', { class: 'row-link', href: `#/projects/${p.id}` },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, p.title), h('span', { class: 'row-sub' }, other)),
    statusBadge(PROJECT_STATUS, p.status)));
}

export function notificationRow(n) {
  return h('li', { class: n.readAt ? '' : 'is-unread' }, h('a', {
    class: 'row-link', href: `#${n.link || '/notifications'}`,
    onclick: () => { if (!n.readAt) api.post(`/notifications/${n.id}/read`).catch(() => {}); },
  },
  h('span', { class: 'row-icon' }, icon('bell')),
  h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, n.title), h('span', { class: 'row-sub' }, fmtRelative(n.createdAt))),
  !n.readAt && h('span', { class: 'dot', 'aria-label': 'غير مقروء' })));
}

// Payment status is separate from project status. No live provider: say so plainly.
export function paymentPanel(payment) {
  if (!payment) return null;
  const sandbox = payment.provider === 'sandbox';
  return h('div', { class: 'payment-box' },
    h('p', { class: 'payment-row' }, h('span', { class: 'muted small' }, 'حالة الدفع'),
      statusBadge(PAYMENT_STATUS, payment.status), sandbox && h('span', { class: 'badge badge-demo' }, 'بيئة دفع تجريبية')),
    h('p', { class: 'payment-row small' },
      h('span', null, 'المبلغ: ', bdi(fmtJOD(payment.amount))),
      h('span', { class: 'muted' }, ` · عمولة المنصة المقترحة: `, bdi(fmtJOD(payment.platformFee)))),
    note(sandbox
      ? 'وضع تجريبي: الحالات تُحاكى من لوحة الإدارة فقط، ولا تُنقل أي أموال حقيقية.'
      : 'لم يُربط مزوّد دفع بعد، لذا لا تُحصَّل أي مبالغ ولا تُحوَّل عبر المنصة. اتفقوا على طريقة الدفع خارج المنصة حتى تفعيل الدفع الإلكتروني.', 'shield'));
}

export { categoryOf };
