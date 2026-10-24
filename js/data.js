// Static reference lists and the demo seed. Every seeded record carries demo: true.

export const CATEGORIES = [
  { id: 'design', label: 'تصميم ومحتوى سوشال ميديا', icon: 'palette', example: 'منشورات، قصص، تقويم محتوى' },
  { id: 'web', label: 'تطوير مواقع بسيطة', icon: 'code', example: 'صفحات تعريفية وصفحات هبوط' },
  { id: 'data', label: 'تنظيف البيانات وتحليلها', icon: 'chart', example: 'جداول، لوحات متابعة، ملخصات' },
  { id: 'slides', label: 'تصميم العروض التقديمية', icon: 'presentation', example: 'عروض مستثمرين وقوالب ورش' },
];

export const UNIVERSITIES = [
  'الجامعة الأردنية', 'جامعة العلوم والتكنولوجيا الأردنية', 'جامعة اليرموك', 'الجامعة الهاشمية',
  'جامعة مؤتة', 'الجامعة الألمانية الأردنية', 'جامعة الأميرة سمية للتكنولوجيا', 'جامعة البلقاء التطبيقية',
  'جامعة آل البيت', 'جامعة الحسين بن طلال',
];

export const CITIES = ['عمّان', 'إربد', 'الزرقاء', 'السلط', 'العقبة', 'مادبا', 'الكرك', 'جرش', 'المفرق', 'عجلون', 'معان', 'الطفيلة'];

export const INDUSTRIES = [
  'مقاهٍ ومطاعم', 'تجزئة ومتاجر', 'تعليم وتدريب', 'صحة وعيادات', 'توزيع ولوجستيات',
  'مخابز وأغذية', 'كتب وثقافة', 'خدمات مهنية', 'سياحة وضيافة', 'أخرى',
];

export const SKILL_SUGGESTIONS = [
  'Figma', 'Canva', 'Adobe Illustrator', 'Photoshop', 'Copywriting', 'HTML', 'CSS', 'JavaScript',
  'WordPress', 'Excel', 'Python', 'SQL', 'Power BI', 'Google Sheets', 'PowerPoint', 'Google Slides',
];

export const PROJECT_STATUS = {
  in_progress: { label: 'قيد التنفيذ', tone: 'info' },
  review: { label: 'بانتظار المراجعة', tone: 'warn' },
  revision: { label: 'مطلوب تعديل', tone: 'danger' },
  completed: { label: 'مكتملة', tone: 'ok' },
};

export const APPLICATION_STATUS = {
  pending: { label: 'قيد المراجعة', tone: 'warn' },
  accepted: { label: 'تم اختيارك', tone: 'ok' },
  rejected: { label: 'لم يتم اختيارك', tone: 'muted' },
};

export const TASK_STATUS = {
  open: { label: 'تستقبل الطلبات', tone: 'info' },
  in_progress: { label: 'قيد التنفيذ', tone: 'warn' },
  completed: { label: 'مكتملة', tone: 'ok' },
};

const DAY = 86400000;

export function createSeed() {
  const now = Date.now();
  const at = (days, hours = 0) => new Date(now + days * DAY + hours * 3600000).toISOString();
  const date = (days) => at(days).slice(0, 10);

  const students = [
    { id: 's-demo', name: 'ليان منصور', university: 'الجامعة الأردنية', major: 'نظم المعلومات الحاسوبية',
      skills: ['Figma', 'Canva', 'HTML', 'CSS', 'PowerPoint'],
      bio: 'طالبة سنة ثالثة أحب تصميم الواجهات وتحويل الأفكار إلى صفحات بسيطة وواضحة.',
      portfolioUrl: 'https://example.com/lian-portfolio', demo: true },
    { id: 's-omar', name: 'عمر الزعبي', university: 'جامعة العلوم والتكنولوجيا الأردنية', major: 'هندسة البرمجيات',
      skills: ['Python', 'Excel', 'Power BI', 'SQL'],
      bio: 'مهتم بتحليل البيانات وبناء لوحات متابعة تساعد أصحاب المشاريع على اتخاذ القرار.',
      portfolioUrl: 'https://example.com/omar-data', demo: true },
    { id: 's-sara', name: 'سارة القيسي', university: 'جامعة اليرموك', major: 'التصميم الجرافيكي',
      skills: ['Adobe Illustrator', 'Photoshop', 'Canva', 'Figma'],
      bio: 'مصممة جرافيك أركز على الهويات البصرية ومحتوى السوشال ميديا للمشاريع الصغيرة.',
      portfolioUrl: 'https://example.com/sara-design', demo: true },
    { id: 's-yazan', name: 'يزن الحوراني', university: 'الجامعة الألمانية الأردنية', major: 'إدارة الأعمال',
      skills: ['Canva', 'Copywriting', 'PowerPoint', 'Google Slides'],
      bio: 'أكتب محتوى تسويقياً قصيراً وأصمم عروضاً تقديمية مرتبة.',
      portfolioUrl: 'https://example.com/yazan-work', demo: true },
  ];

  const companies = [
    { id: 'c-demo', contactName: 'رنا حدّاد', name: 'مقهى السنديان', industry: 'مقاهٍ ومطاعم', city: 'عمّان',
      bio: 'مقهى صغير في جبل اللويبدة يقدّم القهوة المختصة والحلويات المنزلية.', demo: true },
    { id: 'c-zaytouna', contactName: 'خالد العبادي', name: 'متجر زيتونة للمنتجات المحلية', industry: 'تجزئة ومتاجر', city: 'إربد',
      bio: 'متجر عائلي يبيع زيت الزيتون والصابون البلدي من مزارع الشمال.', demo: true },
    { id: 'c-noon', contactName: 'هبة الشريف', name: 'نُون للتوزيع', industry: 'توزيع ولوجستيات', city: 'عمّان',
      bio: 'شركة توزيع مواد غذائية تخدم البقالات في عمّان والزرقاء.', demo: true },
    { id: 'c-darb', contactName: 'محمد الطراونة', name: 'منصة درب للتدريب', industry: 'تعليم وتدريب', city: 'عمّان',
      bio: 'منصة ناشئة تقدم ورشاً قصيرة في المهارات الرقمية.', demo: true },
    { id: 'c-taboon', contactName: 'أم يوسف النسور', name: 'مخبز الطابون', industry: 'مخابز وأغذية', city: 'السلط',
      bio: 'مخبز تقليدي يقدّم خبز الطابون والمعجنات يومياً.', demo: true },
    { id: 'c-smile', contactName: 'د. لينا عوض', name: 'عيادة ابتسامة لطب الأسنان', industry: 'صحة وعيادات', city: 'الزرقاء',
      bio: 'عيادة أسنان عائلية تستقبل الحجوزات عبر الإنترنت والهاتف.', demo: true },
    { id: 'c-harf', contactName: 'سامر بني هاني', name: 'مكتبة الحرف', industry: 'كتب وثقافة', city: 'إربد',
      bio: 'مكتبة مستقلة قرب جامعة اليرموك تبيع الكتب العربية والمترجمة.', demo: true },
  ];

  const task = (o) => ({ status: 'open', demo: true, ...o });
  const tasks = [
    task({ id: 't-posts', companyId: 'c-demo', category: 'design', title: 'تصميم 8 منشورات لمقهى في عمّان',
      summary: 'نحتاج 8 تصاميم لمنشورات إنستغرام تعرّف بقائمة الشتاء الجديدة وتحافظ على هوية المقهى الحالية.',
      scope: 'تصميم 8 منشورات مربعة (1080×1080) بالاعتماد على الشعار والألوان الحالية. يزوّدك المقهى بصور المنتجات والنصوص الأساسية، ويتضمن العمل جولة تعديل واحدة بعد المسودة الأولى.',
      deliverables: ['8 تصاميم نهائية بصيغة PNG', 'ملف المصدر (Figma أو Canva)', 'نسخة بمقاس القصص لثلاثة منشورات'],
      skills: ['Figma', 'Canva', 'Adobe Illustrator'], budget: 60, durationDays: 7, deadline: date(12),
      milestones: ['مسودة أولى لمنشورين', 'التصاميم الثمانية كاملة', 'التعديلات والملفات النهائية'], createdAt: at(-2) }),
    task({ id: 't-landing', companyId: 'c-zaytouna', category: 'web', title: 'إنشاء صفحة تعريفية لمتجر محلي',
      summary: 'صفحة واحدة متجاوبة تعرض منتجات المتجر من زيت الزيتون والصابون البلدي مع زر تواصل عبر واتساب.',
      scope: 'بناء صفحة ثابتة تضم قسماً رئيسياً، وقسماً لستة منتجات، وقسم «من نحن»، ونموذج تواصل بسيط. يجب أن تعمل الصفحة جيداً على الهاتف وأن تُنشر على GitHub Pages أو استضافة مجانية مماثلة.',
      deliverables: ['رابط الصفحة المنشورة', 'مستودع الكود على GitHub', 'دليل قصير لتعديل المنتجات'],
      skills: ['HTML', 'CSS', 'JavaScript'], budget: 120, durationDays: 14, deadline: date(20),
      milestones: ['هيكل الصفحة والتصميم المبدئي', 'المحتوى والتجاوب مع الهاتف', 'النشر والتسليم'], createdAt: at(-1) }),
    task({ id: 't-sales', companyId: 'c-noon', category: 'data', title: 'تنظيف وتحليل بيانات مبيعات',
      summary: 'ملف Excel لمبيعات 12 شهراً يحتوي على تكرارات وأخطاء إدخال، ونريد ملخصاً واضحاً لأفضل المنتجات والمناطق.',
      scope: 'توحيد أسماء المنتجات والمناطق، وإزالة التكرارات، ومعالجة القيم الناقصة، ثم إعداد جداول محورية ورسوم بيانية تجيب عن سؤالين: ما المنتجات الأعلى مبيعاً؟ وكيف تتغير المبيعات شهرياً؟',
      deliverables: ['ملف بيانات نظيف', 'ملخص تحليلي من صفحتين', 'ثلاثة رسوم بيانية على الأقل'],
      skills: ['Excel', 'Python', 'Power BI'], budget: 90, durationDays: 10, deadline: date(16),
      milestones: ['تنظيف البيانات وتوثيق التغييرات', 'التحليل والرسوم البيانية', 'الملخص النهائي'], createdAt: at(-4) }),
    task({ id: 't-pitch', companyId: 'c-darb', category: 'slides', title: 'تصميم عرض تقديمي لمستثمرين',
      summary: 'عرض من 12 شريحة يشرح فكرة المنصة وخطة النمو بأسلوب بصري واضح.',
      scope: 'إعادة تصميم مسودة موجودة في PowerPoint إلى 12 شريحة متناسقة، مع رسوم بيانية بسيطة للأرقام التي نزوّدك بها وأيقونات موحّدة.',
      deliverables: ['ملف PowerPoint قابل للتعديل', 'نسخة PDF', 'قالب شريحة فارغة للاستخدام لاحقاً'],
      skills: ['PowerPoint', 'Google Slides', 'Canva'], budget: 75, durationDays: 5, deadline: date(9),
      milestones: ['اتجاه بصري لثلاث شرائح', 'العرض كاملاً', 'التعديلات النهائية'], createdAt: at(-3) }),
    task({ id: 't-bakery', companyId: 'c-taboon', category: 'design', title: 'خطة محتوى إنستغرام لشهر كامل',
      summary: 'كتابة وتصميم 12 منشوراً تعرّف بمنتجات المخبز اليومية مع تقويم نشر بسيط.',
      scope: 'اقتراح تقويم نشر لأربعة أسابيع، وكتابة نصوص قصيرة باللهجة الأردنية، وتصميم 12 منشوراً باستخدام صور يوفّرها المخبز.',
      deliverables: ['تقويم نشر لمدة شهر', '12 تصميماً مع النصوص', 'ملفات المصدر'],
      skills: ['Canva', 'Copywriting', 'Photoshop'], budget: 80, durationDays: 14, deadline: date(21),
      milestones: ['التقويم والنصوص', 'التصاميم', 'المراجعة والتسليم'], createdAt: at(-5) }),
    task({ id: 't-clinic', companyId: 'c-smile', category: 'web', title: 'تحسين صفحة هبوط لعيادة أسنان',
      summary: 'صفحة الحجز الحالية بطيئة وغير واضحة على الهاتف، ونريد تحسين التصميم وسرعة التحميل.',
      scope: 'مراجعة الصفحة الحالية واقتراح هيكل أوضح، ثم إعادة بنائها بشكل متجاوب مع ضغط الصور وزر حجز واضح يربط بنموذج Google Forms الحالي.',
      deliverables: ['صفحة محدّثة منشورة', 'تقرير قصير بالتحسينات', 'الكود المصدري'],
      skills: ['HTML', 'CSS', 'WordPress'], budget: 150, durationDays: 21, deadline: date(28),
      milestones: ['المراجعة والهيكل المقترح', 'إعادة البناء', 'الاختبار والتسليم'], createdAt: at(-6) }),
    task({ id: 't-template', companyId: 'c-darb', category: 'slides', title: 'قالب عرض لورشة تدريبية',
      summary: 'قالب موحّد لعروض ورش المهارات الرقمية يستخدمه المدرّبون لاحقاً.',
      scope: 'تصميم قالب من 8 تخطيطات (غلاف، عنوان قسم، نص، صورة ونص، مقارنة، جدول، اقتباس، ختام) بألوان المنصة.',
      deliverables: ['قالب Google Slides', 'نسخة PowerPoint', 'دليل استخدام من صفحة واحدة'],
      skills: ['Google Slides', 'PowerPoint'], budget: 50, durationDays: 4, deadline: date(8),
      milestones: ['التخطيطات الأساسية', 'القالب الكامل والدليل'], createdAt: at(-1, -5) }),
    task({ id: 't-dashboard', companyId: 'c-noon', category: 'data', title: 'لوحة متابعة مبيعات أسبوعية',
      summary: 'لوحة تفاعلية بسيطة تتابع مبيعات المندوبين أسبوعياً من ملف Google Sheets.',
      scope: 'ربط ملف Google Sheets بلوحة في Power BI أو Looker Studio تعرض المبيعات حسب المندوب والمنطقة والأسبوع، مع فلاتر للتاريخ.',
      deliverables: ['رابط اللوحة أو ملف PBIX', 'شرح مصوّر لطريقة تحديث البيانات'],
      skills: ['Power BI', 'Google Sheets', 'SQL'], budget: 110, durationDays: 12, deadline: date(18),
      milestones: ['نموذج البيانات', 'اللوحة الأولى', 'الفلاتر والتسليم'], createdAt: at(-7) }),
    task({ id: 't-catalog', companyId: 'c-harf', category: 'web', title: 'صفحة كتالوج للكتب الجديدة',
      summary: 'صفحة بسيطة تعرض الكتب الجديدة مع بحث حسب العنوان أو المؤلف.',
      scope: 'إنشاء صفحة ثابتة تقرأ قائمة الكتب من ملف JSON وتعرضها في بطاقات، مع بحث وفلترة حسب التصنيف.',
      deliverables: ['رابط الصفحة', 'مستودع الكود', 'ملف JSON نموذجي'],
      skills: ['HTML', 'CSS', 'JavaScript'], budget: 95, durationDays: 10, deadline: date(15),
      milestones: ['عرض البطاقات', 'البحث والفلترة', 'التسليم'], createdAt: at(-2, -3) }),
    // Tasks already in a project, so dashboards and the portfolio are not empty on first load.
    task({ id: 't-menu', companyId: 'c-demo', category: 'design', title: 'قائمة مشروبات رقمية للمقهى', status: 'in_progress',
      summary: 'تحويل قائمة المشروبات الورقية إلى قائمة رقمية تُعرض عبر رمز QR على الطاولات.',
      scope: 'تصميم قائمة من 4 صفحات بمقاس الهاتف تشمل المشروبات الساخنة والباردة والحلويات، بنفس هوية المقهى.',
      deliverables: ['ملف PDF مناسب للهاتف', 'ملف المصدر', 'رمز QR يشير إلى الملف'],
      skills: ['Figma', 'Canva'], budget: 70, durationDays: 7, deadline: date(5),
      milestones: ['الهيكل وتوزيع الأقسام', 'التصميم الكامل', 'رمز QR والتسليم'], createdAt: at(-9) }),
    task({ id: 't-branch', companyId: 'c-demo', category: 'slides', title: 'عرض تقديمي لخطة افتتاح فرع جديد', status: 'completed',
      summary: 'عرض داخلي من 10 شرائح يلخّص خطة افتتاح فرع ثانٍ للمقهى.',
      scope: 'تنظيم محتوى الخطة في 10 شرائح واضحة تتضمن الموقع المقترح والتكاليف التقديرية والجدول الزمني.',
      deliverables: ['ملف PowerPoint', 'نسخة PDF'],
      skills: ['PowerPoint', 'Canva'], budget: 65, durationDays: 5, deadline: date(-18),
      milestones: ['هيكل العرض', 'التصميم الكامل', 'التعديلات النهائية'], createdAt: at(-30) }),
    task({ id: 't-survey', companyId: 'c-demo', category: 'data', title: 'تحليل استبيان رضا الزبائن', status: 'in_progress',
      summary: 'تحليل 140 إجابة على استبيان رضا الزبائن واستخراج أهم الملاحظات.',
      scope: 'تنظيف إجابات Google Forms، وتصنيف الملاحظات المفتوحة، وإعداد ملخص بالنتائج مع رسوم بيانية بسيطة.',
      deliverables: ['ملف البيانات المصنّفة', 'ملخص النتائج بصيغة PDF'],
      skills: ['Excel', 'Google Sheets'], budget: 85, durationDays: 6, deadline: date(3),
      milestones: ['تنظيف الإجابات', 'التصنيف والتحليل', 'الملخص'], createdAt: at(-12) }),
  ];

  const app = (id, taskId, studentId, status, proposal, deliveryDays, createdAt) => {
    const s = students.find((x) => x.id === studentId);
    return { id, taskId, studentId, status, proposal, portfolioUrl: s.portfolioUrl, deliveryDays, createdAt, demo: true };
  };
  const applications = [
    app('a-sara-posts', 't-posts', 's-sara', 'pending',
      'صممت سابقاً محتوى لمقهيين في إربد، وأقترح البدء بلوحة مزاجية تعتمد ألوان الشعار الحالية ثم تسليم منشورين للمراجعة خلال يومين.', 6, at(-1, -4)),
    app('a-yazan-posts', 't-posts', 's-yazan', 'pending',
      'أستطيع كتابة نصوص قصيرة مرافقة للتصاميم إلى جانب العمل على Canva، وسأشارك المسودة الأولى بعد ثلاثة أيام.', 7, at(-1, -1)),
    app('a-lian-menu', 't-menu', 's-demo', 'accepted',
      'أقترح قائمة بأقسام واضحة وصور صغيرة لكل مشروب، مع اختبار القراءة على شاشات هواتف مختلفة.', 7, at(-8)),
    app('a-lian-branch', 't-branch', 's-demo', 'accepted',
      'سأحوّل الخطة إلى قصة بصرية قصيرة: المشكلة، الموقع، التكلفة، ثم الجدول الزمني.', 5, at(-29)),
    app('a-omar-survey', 't-survey', 's-omar', 'accepted',
      'سأستخدم Python لتنظيف الإجابات وتصنيف الملاحظات المفتوحة، ثم ألخّص النتائج في صفحتين.', 5, at(-11)),
  ];

  const projects = [
    { id: 'p-menu', taskId: 't-menu', applicationId: 'a-lian-menu', studentId: 's-demo', companyId: 'c-demo',
      status: 'in_progress', startedAt: at(-3), completedAt: null, demo: true,
      milestones: [{ title: 'الهيكل وتوزيع الأقسام', done: true }, { title: 'التصميم الكامل', done: false }, { title: 'رمز QR والتسليم', done: false }],
      submissions: [], feedback: null, revisionNote: null,
      messages: [
        { id: 'm1', from: 'company', text: 'أهلاً ليان، أرسلنا لكِ أسماء المشروبات والأسعار المحدّثة. هل تحتاجين أي شيء آخر قبل البدء؟', at: at(-3, 2) },
        { id: 'm2', from: 'student', text: 'شكراً! وصلتني القائمة، وأنهيت توزيع الأقسام. سأشارك التصميم الكامل قريباً.', at: at(-2) },
      ],
      activity: [
        { text: 'تم اختيار ليان منصور وبدء المشروع', at: at(-3) },
        { text: 'أنجزت الطالبة مرحلة «الهيكل وتوزيع الأقسام»', at: at(-2) },
      ] },
    { id: 'p-branch', taskId: 't-branch', applicationId: 'a-lian-branch', studentId: 's-demo', companyId: 'c-demo',
      status: 'completed', startedAt: at(-27), completedAt: at(-20), demo: true,
      milestones: [{ title: 'هيكل العرض', done: true }, { title: 'التصميم الكامل', done: true }, { title: 'التعديلات النهائية', done: true }],
      submissions: [
        { id: 'sub-b1', round: 1, links: ['https://example.com/branch-plan-v1.pdf'], note: 'النسخة الأولى من العرض كاملة.', attachments: [], at: at(-23) },
        { id: 'sub-b2', round: 2, links: ['https://example.com/branch-plan-v2.pdf'], note: 'عدّلت شريحة التكاليف حسب الملاحظات.', attachments: [], at: at(-21) },
      ],
      feedback: { rating: 5, text: 'عرض منظّم وواضح، والتزام ممتاز بالمواعيد وتجاوب سريع مع الملاحظات.', at: at(-20) },
      revisionNote: 'نرجو تبسيط شريحة التكاليف وإضافة جدول زمني مختصر.',
      messages: [{ id: 'm3', from: 'company', text: 'شكراً على العرض، سنستخدمه في اجتماع الشركاء.', at: at(-20, 1) }],
      activity: [
        { text: 'تم اختيار ليان منصور وبدء المشروع', at: at(-27) },
        { text: 'سلّمت الطالبة الجولة 1', at: at(-23) },
        { text: 'طلبت الشركة تعديلات', at: at(-22) },
        { text: 'سلّمت الطالبة الجولة 2', at: at(-21) },
        { text: 'اعتمدت الشركة الإنجاز', at: at(-20) },
      ] },
    { id: 'p-survey', taskId: 't-survey', applicationId: 'a-omar-survey', studentId: 's-omar', companyId: 'c-demo',
      status: 'review', startedAt: at(-6), completedAt: null, demo: true,
      milestones: [{ title: 'تنظيف الإجابات', done: true }, { title: 'التصنيف والتحليل', done: true }, { title: 'الملخص', done: true }],
      submissions: [
        { id: 'sub-s1', round: 1, links: ['https://example.com/survey-summary.pdf', 'https://example.com/survey-data.xlsx'],
          note: 'أرفقت الملخص وملف البيانات المصنّفة. أبرز ملاحظة: سرعة الخدمة وقت الذروة.', attachments: [], at: at(-1) },
      ],
      feedback: null, revisionNote: null,
      messages: [{ id: 'm4', from: 'student', text: 'سلّمت الملخص، وجاهز لأي ملاحظات.', at: at(-1, 1) }],
      activity: [
        { text: 'تم اختيار عمر الزعبي وبدء المشروع', at: at(-6) },
        { text: 'سلّم الطالب الجولة 1', at: at(-1) },
      ] },
  ];

  return {
    version: 1,
    session: { role: null, studentId: 's-demo', companyId: 'c-demo' },
    students, companies, tasks, applications, projects,
    notifications: [],
    saved: {},
  };
}
