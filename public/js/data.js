// Static reference lists and status labels shared by the views.

export const CATEGORIES = [
  { id: 'design', label: 'تصميم ومحتوى سوشال ميديا', icon: 'palette', example: 'منشورات، قصص، تقويم محتوى' },
  { id: 'web', label: 'تطوير مواقع بسيطة', icon: 'code', example: 'صفحات تعريفية وصفحات هبوط' },
  { id: 'data', label: 'تنظيف البيانات وتحليلها', icon: 'chart', example: 'جداول، لوحات متابعة، ملخصات' },
  { id: 'slides', label: 'تصميم العروض التقديمية', icon: 'presentation', example: 'عروض مستثمرين وقوالب ورش' },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

export const UNIVERSITIES = [
  'الجامعة الأردنية', 'جامعة العلوم والتكنولوجيا الأردنية', 'جامعة اليرموك', 'الجامعة الهاشمية',
  'جامعة مؤتة', 'الجامعة الألمانية الأردنية', 'جامعة الأميرة سمية للتكنولوجيا', 'جامعة البلقاء التطبيقية',
  'جامعة آل البيت', 'جامعة الحسين بن طلال',
];

export const CITIES = ['عمّان', 'إربد', 'الزرقاء', 'السلط', 'العقبة', 'مادبا', 'الكرك', 'جرش', 'المفرق', 'عجلون', 'معان', 'الطفيلة'];

export const INDUSTRIES = [
  'مقاهٍ ومطاعم', 'تجزئة ومتاجر', 'تعليم وتدريب', 'صحة وعيادات', 'توزيع ولوجستيات',
  'مخابز وأغذية', 'كتب وثقافة', 'خدمات مهنية', 'سياحة وضيافة', 'تقنية', 'أخرى',
];

export const SKILL_SUGGESTIONS = [
  'Figma', 'Canva', 'Adobe Illustrator', 'Photoshop', 'Copywriting', 'HTML', 'CSS', 'JavaScript',
  'WordPress', 'Excel', 'Python', 'SQL', 'Power BI', 'Google Sheets', 'PowerPoint', 'Google Slides',
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
