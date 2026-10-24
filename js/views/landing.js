import { h, bdi } from '../dom.js';
import { icon } from '../icons.js';
import { CATEGORIES } from '../data.js';
import * as store from '../store.js';

const STEPS = [
  ['briefcase', 'الشركة تنشر مهمّة', 'نطاق واضح، مخرجات، مهارات، ميزانية بالدينار، وموعد تسليم.'],
  ['file', 'الطالب يتقدّم', 'عرض مختصر، رابط أعمال سابقة، ومدة تسليم متوقعة.'],
  ['users', 'الشركة تختار', 'تقارن العروض والملفات وتختار طالباً واحداً بعد التأكيد.'],
  ['milestones', 'يبدأ المشروع', 'مساحة مشتركة فيها الموجز والمراحل والرسائل والسجل.'],
  ['upload', 'تسليم العمل', 'روابط المخرجات وملاحظة توضح ما تم إنجازه.'],
  ['refresh', 'مراجعة أو تعديل', 'تعتمد الشركة العمل أو تطلب تعديلات بملاحظات واضحة.'],
  ['award', 'الإنجاز والتقييم', 'يُغلق المشروع ويُضاف مع تقييم الشركة إلى ملف الطالب.'],
];

const FAQ = [
  ['ما هي مهمّة؟', 'منصة أردنية تربط طلاب الجامعات بالمشاريع الصغيرة التي تحتاج مهام رقمية قصيرة ومدفوعة، مثل تصميم المحتوى وصفحات الويب البسيطة وتحليل البيانات والعروض التقديمية.'],
  ['كم تستغرق المهمة عادةً؟', 'نشجّع على مهام قصيرة تتراوح بين بضعة أيام وثلاثة أسابيع، مقسّمة إلى مراحل صغيرة. إذا كان العمل أكبر، يُفضّل تقسيمه إلى أكثر من مهمّة.'],
  ['كيف تُحدَّد الميزانية والدفع؟', 'تحدد الشركة مبلغاً ثابتاً بالدينار الأردني يظهر للطالب قبل التقديم، دون مزايدة. في هذا النموذج الأولي تُعرض المبالغ للتوضيح فقط ولا تتم أي معاملة مالية حقيقية.'],
  ['كيف يتم اختيار الطالب؟', 'تطّلع الشركة على عرض كل متقدّم ومهاراته ورابط أعماله، ثم تختار طالباً واحداً. يصل إشعار للمختار ولبقية المتقدّمين.'],
  ['ماذا لو احتاج العمل إلى تعديلات؟', 'بعد كل تسليم يمكن للشركة اعتماد العمل أو طلب تعديلات مع ملاحظة مكتوبة إلزامية، ثم يعيد الطالب التسليم.'],
  ['هل أحصل على شهادة؟', 'يُضاف المشروع المكتمل وتقييم الشركة إلى ملف إنجازاتك، ويمكنك طباعة ملخص للمشروع. الملخص في هذا النموذج ليس شهادة معتمدة من أي جهة.'],
  ['هل هذا الموقع يعمل فعلياً؟', 'هذا نموذج أولي تفاعلي. الدخول تجريبي، والرسائل والملفات والبيانات تُحفظ في متصفحك فقط، ولا تنتقل بين الأجهزة.'],
];

export function landing() {
  const r = store.role();
  const tasksHref = r === 'student' ? '#/tasks' : '#/start?next=/tasks';
  const publishHref = r === 'company' ? '#/company/publish' : '#/start?next=/company/publish';
  const ctas = (cls = '') => h('div', { class: `cta-row ${cls}` },
    h('a', { class: 'btn btn-primary btn-lg', href: tasksHref }, icon('search'), 'استكشف المهام'),
    h('a', { class: 'btn btn-secondary btn-lg', href: publishHref }, icon('plus'), 'انشر مهمّة'));

  return h('div', { class: 'landing' },
    // Hero
    h('section', { class: 'hero container', 'aria-labelledby': 'hero-title' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'eyebrow' }, 'منصة أردنية للمهام الرقمية القصيرة'),
        h('h1', { id: 'hero-title', class: 'hero-title', tabindex: '-1', 'data-page-title': true }, 'خبرتك تبدأ ', h('span', { class: 'accent' }, 'بمهمّة')),
        h('p', { class: 'hero-lead' },
          'مهمّة تربط طلاب الجامعات في الأردن بالمشاريع الصغيرة التي تحتاج إنجاز مهام رقمية قصيرة ومدفوعة. ',
          'الطالب يكسب خبرة عملية ودخلاً وملف أعمال، والشركة تنجز عملها بنطاق وميزانية واضحين.'),
        ctas(),
        h('p', { class: 'hero-note' }, icon('shield'), 'نموذج أولي تفاعلي: جرّب الرحلة كاملة بدخول تجريبي، دون حساب أو دفع حقيقي.')),
      preview()),

    // What is it
    h('section', { class: 'container about', 'aria-labelledby': 'about-title' },
      h('h2', { id: 'about-title', class: 'sr-only' }, 'ما هي مهمّة'),
      h('ul', { class: 'about-grid' },
        aboutItem('clock', 'مهام قصيرة بنطاق واضح', 'من أيام قليلة إلى ثلاثة أسابيع، مع مخرجات ومراحل محددة مسبقاً.'),
        aboutItem('wallet', 'ميزانية ثابتة بالدينار', 'يرى الطالب المبلغ قبل التقديم، دون مزايدة أو تفاوض.'),
        aboutItem('award', 'خبرة تُضاف إلى ملفك', 'كل مشروع مكتمل يظهر في ملف إنجازاتك مع تقييم الشركة.'))),

    // How it works
    h('section', { id: 'how', class: 'container block', 'aria-labelledby': 'how-title' },
      blockHead('how-title', 'كيف تعمل مهمّة', 'من نشر المهمّة إلى تحديث ملف الطالب، في مسار واحد واضح للطرفين.'),
      h('ol', { class: 'steps' },
        STEPS.map(([ico, title, text], i) => h('li', { class: 'step card-raised' },
          h('span', { class: 'step-num', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', { class: 'step-icon' }, icon(ico)),
          h('h3', { class: 'step-title' }, title),
          h('p', { class: 'step-text' }, text))))),

    // Services
    h('section', { id: 'services', class: 'container block', 'aria-labelledby': 'services-title' },
      blockHead('services-title', 'أنواع المهام', 'نبدأ بأربع فئات تحتاجها المشاريع الصغيرة كثيراً وتناسب مهارات الطلاب.'),
      h('ul', { class: 'services' },
        CATEGORIES.map((c) => {
          const sample = store.getState().tasks.find((t) => t.category === c.id && t.demo);
          return h('li', { class: 'service card-raised' },
            h('span', { class: 'service-icon' }, icon(c.icon)),
            h('h3', { class: 'service-title' }, c.label),
            h('p', { class: 'service-text' }, c.example),
            sample && h('p', { class: 'service-sample' },
              h('span', { class: 'muted' }, 'مثال تجريبي: '), sample.title, ' — ', h('strong', null, bdi(`${sample.budget} د.أ`))));
        }))),

    // Benefits
    h('section', { id: 'benefits', class: 'container block', 'aria-labelledby': 'benefits-title' },
      blockHead('benefits-title', 'ماذا يستفيد كل طرف', null),
      h('div', { class: 'benefits' },
        benefitPanel('graduation', 'للطلاب', [
          'خبرة عملية حقيقية قبل التخرّج',
          'دخل واضح متفق عليه قبل البدء',
          'ملف إنجازات يعرض المشاريع والتقييمات',
          'مهام مرنة تناسب جدول المحاضرات',
        ], h('a', { class: 'btn btn-primary', href: tasksHref }, 'استكشف المهام')),
        benefitPanel('building', 'للشركات والمشاريع الصغيرة', [
          'أنجز مهام رقمية دون توظيف طويل الأمد',
          'حدّد النطاق والميزانية والمراحل بنفسك',
          'اختر من عروض الطلاب وملفات أعمالهم',
          'راجع العمل واطلب التعديلات قبل الاعتماد',
        ], h('a', { class: 'btn btn-secondary', href: publishHref }, 'انشر مهمّة')))),

    // FAQ
    h('section', { id: 'faq', class: 'container block faq-block', 'aria-labelledby': 'faq-title' },
      blockHead('faq-title', 'الأسئلة الشائعة', null),
      h('div', { class: 'faq' }, FAQ.map(([q, a]) => h('details', { class: 'faq-item' },
        h('summary', null, h('span', null, q), icon('chevron-left', 'faq-chev')),
        h('p', null, a))))),

    // Closing CTA
    h('section', { class: 'container', 'aria-labelledby': 'cta-title' },
      h('div', { class: 'cta-band card-raised' },
        h('div', null,
          h('h2', { id: 'cta-title', class: 'cta-title' }, 'جرّب الرحلة كاملة خلال دقائق'),
          h('p', { class: 'muted' }, 'انشر مهمّة كشركة، ثم بدّل إلى وضع الطالب وتقدّم لها، وتابع المشروع حتى الاعتماد.')),
        ctas('cta-row-end'))));
}

function blockHead(id, title, sub) {
  return h('div', { class: 'block-head' },
    h('h2', { id, class: 'block-title', tabindex: '-1' }, title),
    sub && h('p', { class: 'block-sub' }, sub));
}

function aboutItem(ico, title, text) {
  return h('li', { class: 'about-item' },
    h('span', { class: 'about-icon' }, icon(ico)),
    h('div', null, h('h3', { class: 'about-title' }, title), h('p', { class: 'muted' }, text)));
}

function benefitPanel(ico, title, items, cta) {
  return h('div', { class: 'benefit card-raised' },
    h('h3', { class: 'benefit-title' }, h('span', { class: 'benefit-icon' }, icon(ico)), title),
    h('ul', { class: 'check-list' }, items.map((t) => h('li', null, icon('check'), h('span', null, t)))),
    cta);
}

// Static, non-interactive illustration of the project workspace.
function preview() {
  const ms = [['مسودة أولى لمنشورين', true], ['التصاميم الثمانية كاملة', true], ['التعديلات والملفات النهائية', false]];
  return h('figure', { class: 'preview' },
    h('div', { class: 'preview-card card-raised', 'aria-hidden': 'true' },
      h('div', { class: 'preview-top' },
        h('span', { class: 'preview-label' }, icon('folder'), 'مساحة المشروع'),
        h('span', { class: 'badge badge-warn' }, 'بانتظار المراجعة')),
      h('p', { class: 'preview-title' }, 'تصميم 8 منشورات لمقهى في عمّان'),
      h('p', { class: 'preview-company' }, icon('building'), 'مقهى السنديان ', h('span', { class: 'badge badge-demo' }, 'تجريبي')),
      h('div', { class: 'preview-meta' },
        h('span', { class: 'inset-pill' }, icon('wallet'), bdi('60 د.أ')),
        h('span', { class: 'inset-pill' }, icon('clock'), '7 أيام'),
        h('span', { class: 'inset-pill' }, icon('milestones'), '3 مراحل')),
      h('ul', { class: 'preview-ms' }, ms.map(([t, done]) => h('li', { class: done ? 'done' : '' },
        h('span', { class: 'tick' }, done && icon('check')), t))),
      h('div', { class: 'preview-msg' },
        h('span', { class: 'avatar avatar-sm' }, 'لم'),
        h('p', null, 'سلّمت التصاميم الثمانية، بانتظار ملاحظاتكم.')),
      h('div', { class: 'preview-actions' },
        h('span', { class: 'btn btn-ghost btn-sm' }, 'طلب تعديلات'),
        h('span', { class: 'btn btn-primary btn-sm' }, icon('check'), 'اعتماد الإنجاز'))),
    h('figcaption', { class: 'preview-cap' }, 'معاينة لمساحة المشروع المشتركة في النموذج التجريبي'));
}
