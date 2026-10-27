// Static reference lists and status labels shared by the views.

export const CATEGORIES = [
  { id: 'design', label: 'تصميم ومحتوى سوشال ميديا', icon: 'palette', example: 'منشورات، قصص، تقويم محتوى' },
  { id: 'web', label: 'تطوير مواقع بسيطة', icon: 'code', example: 'صفحات تعريفية وصفحات هبوط' },
  { id: 'data', label: 'تنظيف البيانات وتحليلها', icon: 'chart', example: 'جداول، لوحات متابعة، ملخصات' },
  { id: 'slides', label: 'تصميم العروض التقديمية', icon: 'presentation', example: 'عروض مستثمرين وقوالب ورش' },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

// Accredited universities and university colleges in Jordan (Ministry of Higher Education categories), checked on
// 2026-10-27 against the Arabic Wikipedia list and an accreditation directory. Specialist cooking, aviation and music
// academies are left out. Suggestions only: students can type any name.
export const UNIVERSITIES = [
  // Public universities (10)
  'الجامعة الأردنية', 'جامعة العلوم والتكنولوجيا الأردنية', 'جامعة اليرموك', 'الجامعة الهاشمية',
  'جامعة مؤتة', 'الجامعة الألمانية الأردنية', 'جامعة البلقاء التطبيقية', 'جامعة آل البيت',
  'جامعة الحسين بن طلال', 'جامعة الطفيلة التقنية', 'الجامعة الأردنية – فرع العقبة',
  // Private universities (18)
  'جامعة الأميرة سمية للتكنولوجيا', 'جامعة عمان الأهلية', 'جامعة العلوم التطبيقية الخاصة', 'جامعة فيلادلفيا',
  'جامعة البترا', 'جامعة الإسراء', 'جامعة الزيتونة الأردنية', 'جامعة الزرقاء', 'جامعة إربد الأهلية',
  'جامعة جرش', 'جامعة جدارا', 'جامعة عمان العربية', 'جامعة الشرق الأوسط', 'الجامعة الأمريكية في مادبا',
  'جامعة عجلون الوطنية', 'جامعة العقبة للتكنولوجيا', 'جامعة العقبة للعلوم الطبية', 'جامعة ابن سينا للعلوم الطبية',
  // Special-law and regional universities (3)
  'جامعة الحسين التقنية', 'جامعة العلوم الإسلامية العالمية', 'الجامعة العربية المفتوحة – فرع الأردن',
  // University colleges
  'كلية لومينوس الجامعية التقنية', 'كلية الخوارزمي الجامعية التقنية', 'كلية عمون الجامعية التطبيقية',
  'الكلية الجامعية العربية للتكنولوجيا', 'الكلية الجامعية الوطنية للتكنولوجيا', 'كلية طلال أبو غزالة الجامعية للابتكار',
  'كلية العلوم التربوية والآداب (الأونروا)',
];

export const CITIES = ['عمّان', 'إربد', 'الزرقاء', 'السلط', 'العقبة', 'مادبا', 'الكرك', 'جرش', 'المفرق', 'عجلون', 'معان', 'الطفيلة'];

export const INDUSTRIES = [
  'مقاهٍ ومطاعم', 'تجزئة ومتاجر', 'تعليم وتدريب', 'صحة وعيادات', 'توزيع ولوجستيات',
  'مخابز وأغذية', 'كتب وثقافة', 'خدمات مهنية', 'سياحة وضيافة', 'تقنية', 'أخرى',
];

// Quick picks shown under every skills field; the full grouped list opens behind "more skills".
// Tools keep their English names; general skills are in Arabic. Matching ignores case, so keep one spelling per skill.
export const SKILL_SUGGESTIONS = [
  'Figma', 'Canva', 'Adobe Illustrator', 'Photoshop', 'تصميم واجهات (UI)', 'HTML', 'CSS', 'JavaScript',
  'React', 'WordPress', 'Python', 'SQL', 'Power BI', 'Google Sheets', 'PowerPoint', 'Copywriting',
];

// Design runs from basics to professional work, then the tools around it. Each skill appears in one group only.
export const SKILL_GROUPS = [
  ['أساسيات التصميم', ['Canva', 'Adobe Express', 'تصميم منشورات سوشال ميديا', 'تصميم شعارات', 'تصميم مطبوعات', 'نظرية الألوان', 'الخطوط والطباعة (Typography)', 'تعديل الصور', 'رسم رقمي']],
  ['التصميم الاحترافي', ['Figma', 'Adobe Illustrator', 'Photoshop', 'Adobe InDesign', 'Adobe XD', 'Lightroom', 'Affinity Designer', 'Procreate', 'هوية بصرية', 'دليل الهوية (Brand Guidelines)', 'تصميم واجهات (UI)', 'تجربة المستخدم (UX)', 'بحث المستخدمين', 'مخططات أولية (Wireframes)', 'نماذج تفاعلية (Prototyping)', 'أنظمة التصميم (Design Systems)', 'تصميم أيقونات', 'تصميم تغليف']],
  ['أدوات التصميم والتعاون', ['FigJam', 'Miro', 'Framer', 'Webflow', 'Spline', 'Notion', 'Trello', 'Jira', 'Slack', 'Google Workspace']],
  ['الواجهات الأمامية (Front-end)', ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue.js', 'Angular', 'Tailwind CSS', 'Bootstrap', 'Sass', 'تصميم متجاوب (Responsive)', 'إمكانية الوصول (Accessibility)', 'Vite', 'REST APIs']],
  ['الويب والتطبيقات', ['WordPress', 'Shopify', 'Wix', 'PHP', 'Laravel', 'Node.js', 'Python', 'Django', 'Firebase', 'Flutter', 'React Native', 'Git', 'GitHub', 'VS Code']],
  ['الفيديو والصوت', ['Premiere Pro', 'After Effects', 'CapCut', 'DaVinci Resolve', 'مونتاج فيديو', 'موشن جرافيك', 'تصوير فوتوغرافي', 'تعليق صوتي']],
  ['التسويق والمحتوى', ['Copywriting', 'كتابة محتوى', 'إدارة حسابات التواصل', 'SEO', 'Google Ads', 'Meta Ads', 'TikTok', 'Instagram', 'التسويق بالبريد', 'Mailchimp']],
  ['الكتابة واللغات', ['ترجمة عربي-إنجليزي', 'تدقيق لغوي', 'كتابة تقنية', 'تفريغ صوتي', 'Microsoft Word']],
  ['البيانات', ['Google Sheets', 'Power BI', 'SQL', 'Tableau', 'Looker Studio', 'تحليل بيانات', 'إدخال بيانات']],
  ['الأعمال والعروض', ['PowerPoint', 'Google Slides', 'Keynote', 'بحث سوق', 'خدمة العملاء', 'محاسبة', 'QuickBooks']],
  ['التصميم الهندسي و3D', ['AutoCAD', 'SketchUp', 'Blender', 'نمذجة ثلاثية الأبعاد']],
];

export const TASK_STATUS = {
  draft: { label: 'مسودة', tone: 'muted' },
  published: { label: 'منشورة', tone: 'info' },
  assigned: { label: 'مُسندة', tone: 'warn' },
  completed: { label: 'مكتملة', tone: 'ok' },
  cancelled: { label: 'ملغاة', tone: 'danger' },
};

export const APPLICATION_STATUS = {
  submitted: { label: 'قيد المراجعة', tone: 'warn' },
  withdrawn: { label: 'مسحوب', tone: 'muted' },
  rejected: { label: 'لم يتم الاختيار', tone: 'muted' },
  offered: { label: 'أُرسل عرض', tone: 'ok' },
};

export const OFFER_STATUS = {
  pending: { label: 'عرض بانتظار الرد', tone: 'warn' },
  accepted: { label: 'عرض مقبول', tone: 'ok' },
  declined: { label: 'اعتذر الطالب', tone: 'muted' },
  expired: { label: 'انتهت صلاحية العرض', tone: 'muted' },
  withdrawn: { label: 'العرض مسحوب', tone: 'muted' },
};

export const PROJECT_STATUS = {
  in_progress: { label: 'قيد التنفيذ', tone: 'info' },
  awaiting_review: { label: 'بانتظار المراجعة', tone: 'warn' },
  revision_requested: { label: 'مطلوب تعديل', tone: 'danger' },
  completed: { label: 'مكتملة', tone: 'ok' },
  cancelled: { label: 'ملغى', tone: 'muted' },
};

export const PAYMENT_STATUS = {
  pending_integration: { label: 'بانتظار ربط مزوّد الدفع', tone: 'muted' },
  awaiting_payment: { label: 'بانتظار دفع الشركة', tone: 'warn' },
  authorized: { label: 'مبلغ محجوز', tone: 'info' },
  captured: { label: 'تم التحصيل', tone: 'info' },
  payout_pending: { label: 'تحويل للطالب قيد التنفيذ', tone: 'info' },
  paid_out: { label: 'حُوِّل للطالب', tone: 'ok' },
  refunded: { label: 'مسترد', tone: 'muted' },
  failed: { label: 'فشلت العملية', tone: 'danger' },
  cancelled: { label: 'ملغى', tone: 'muted' },
};

export const REPORT_REASONS = [
  ['spam', 'محتوى مزعج أو مكرر'], ['fraud', 'احتيال أو انتحال'], ['inappropriate', 'محتوى غير لائق'],
  ['dispute', 'نزاع حول المشروع'], ['other', 'سبب آخر'],
];

export const ALLOWED_FILES = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.docx,.xlsx,.pptx,.csv,.txt';
