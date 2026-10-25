// Development/demo seed: fictional companies, students and tasks, all flagged is_demo.
// Refuses to run against production unless DEMO_MODE=true (a separate demo environment).
import { fileURLToPath } from 'node:url';
import { createContext } from '../context.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../lib/security.js';
import { upsertSkills } from '../routes/profiles.js';

const DAY = 86400_000;

const COMPANIES = [
  ['cafe', 'مقهى السنديان', 'رنا حدّاد', 'مقاهٍ ومطاعم', 'عمّان', 'مقهى صغير في جبل اللويبدة يقدّم القهوة المختصة والحلويات المنزلية.', 'unverified'],
  ['zaytouna', 'متجر زيتونة للمنتجات المحلية', 'خالد العبادي', 'تجزئة ومتاجر', 'إربد', 'متجر عائلي يبيع زيت الزيتون والصابون البلدي من مزارع الشمال.', 'pending'],
  ['noon', 'نُون للتوزيع', 'هبة الشريف', 'توزيع ولوجستيات', 'عمّان', 'شركة توزيع مواد غذائية تخدم البقالات في عمّان والزرقاء.', 'unverified'],
  ['darb', 'منصة درب للتدريب', 'محمد الطراونة', 'تعليم وتدريب', 'عمّان', 'منصة ناشئة تقدّم ورشاً قصيرة في المهارات الرقمية.', 'unverified'],
  ['taboon', 'مخبز الطابون', 'أم يوسف النسور', 'مخابز وأغذية', 'السلط', 'مخبز تقليدي يقدّم خبز الطابون والمعجنات يومياً.', 'unverified'],
  ['smile', 'عيادة ابتسامة لطب الأسنان', 'د. لينا عوض', 'صحة وعيادات', 'الزرقاء', 'عيادة أسنان عائلية تستقبل الحجوزات عبر الإنترنت والهاتف.', 'unverified'],
];

const STUDENTS = [
  ['lian', 'ليان منصور', 'الجامعة الأردنية', 'نظم المعلومات الحاسوبية', ['Figma', 'Canva', 'HTML', 'CSS', 'PowerPoint'], 'طالبة سنة ثالثة أحب تصميم الواجهات وتحويل الأفكار إلى صفحات بسيطة وواضحة.'],
  ['omar', 'عمر الزعبي', 'جامعة العلوم والتكنولوجيا الأردنية', 'هندسة البرمجيات', ['Python', 'Excel', 'Power BI', 'SQL'], 'مهتم بتحليل البيانات وبناء لوحات متابعة تساعد أصحاب المشاريع على اتخاذ القرار.'],
  ['sara', 'سارة القيسي', 'جامعة اليرموك', 'التصميم الجرافيكي', ['Adobe Illustrator', 'Photoshop', 'Canva', 'Figma'], 'مصممة جرافيك أركز على الهويات البصرية ومحتوى السوشال ميديا للمشاريع الصغيرة.'],
  ['yazan', 'يزن الحوراني', 'الجامعة الألمانية الأردنية', 'إدارة الأعمال', ['Canva', 'Copywriting', 'PowerPoint', 'Google Slides'], 'أكتب محتوى تسويقياً قصيراً وأصمم عروضاً تقديمية مرتبة.'],
];

const T = (key, company, category, title, summary, scope, deliverables, skills, milestones, budget, duration, deadlineDays, status = 'published', createdDays = -2) =>
  ({ key, company, category, title, summary, scope, deliverables, skills, milestones, budget, duration, deadlineDays, status, createdDays });

const TASKS = [
  T('posts', 'cafe', 'design', 'تصميم 8 منشورات لمقهى في عمّان', 'نحتاج 8 تصاميم لمنشورات إنستغرام تعرّف بقائمة الشتاء الجديدة وتحافظ على هوية المقهى الحالية.',
    'تصميم 8 منشورات مربعة (1080×1080) بالاعتماد على الشعار والألوان الحالية. يزوّدك المقهى بصور المنتجات والنصوص الأساسية، ويتضمن العمل جولة تعديل واحدة بعد المسودة الأولى.',
    ['8 تصاميم نهائية بصيغة PNG', 'ملف المصدر (Figma أو Canva)', 'نسخة بمقاس القصص لثلاثة منشورات'], ['Figma', 'Canva', 'Adobe Illustrator'], ['مسودة أولى لمنشورين', 'التصاميم الثمانية كاملة', 'التعديلات والملفات النهائية'], 60, 7, 12),
  T('landing', 'zaytouna', 'web', 'إنشاء صفحة تعريفية لمتجر محلي', 'صفحة واحدة متجاوبة تعرض منتجات المتجر من زيت الزيتون والصابون البلدي مع زر تواصل عبر واتساب.',
    'بناء صفحة ثابتة تضم قسماً رئيسياً، وقسماً لستة منتجات، وقسم «من نحن»، ونموذج تواصل بسيط. يجب أن تعمل الصفحة جيداً على الهاتف.',
    ['رابط الصفحة المنشورة', 'مستودع الكود على GitHub', 'دليل قصير لتعديل المنتجات'], ['HTML', 'CSS', 'JavaScript'], ['هيكل الصفحة والتصميم المبدئي', 'المحتوى والتجاوب مع الهاتف', 'النشر والتسليم'], 120, 14, 20, 'published', -1),
  T('sales', 'noon', 'data', 'تنظيف وتحليل بيانات مبيعات', 'ملف Excel لمبيعات 12 شهراً يحتوي على تكرارات وأخطاء إدخال، ونريد ملخصاً واضحاً لأفضل المنتجات والمناطق.',
    'توحيد أسماء المنتجات والمناطق، وإزالة التكرارات، ومعالجة القيم الناقصة، ثم إعداد جداول محورية ورسوم بيانية تجيب عن أهم الأسئلة.',
    ['ملف بيانات نظيف', 'ملخص تحليلي من صفحتين', 'ثلاثة رسوم بيانية على الأقل'], ['Excel', 'Python', 'Power BI'], ['تنظيف البيانات وتوثيق التغييرات', 'التحليل والرسوم البيانية', 'الملخص النهائي'], 90, 10, 16, 'published', -4),
  T('pitch', 'darb', 'slides', 'تصميم عرض تقديمي لمستثمرين', 'عرض من 12 شريحة يشرح فكرة المنصة وخطة النمو بأسلوب بصري واضح.',
    'إعادة تصميم مسودة موجودة في PowerPoint إلى 12 شريحة متناسقة، مع رسوم بيانية بسيطة للأرقام التي نزوّدك بها وأيقونات موحّدة.',
    ['ملف PowerPoint قابل للتعديل', 'نسخة PDF'], ['PowerPoint', 'Google Slides', 'Canva'], ['اتجاه بصري لثلاث شرائح', 'العرض كاملاً', 'التعديلات النهائية'], 75, 5, 9, 'published', -3),
  T('bakery', 'taboon', 'design', 'خطة محتوى إنستغرام لشهر كامل', 'كتابة وتصميم 12 منشوراً تعرّف بمنتجات المخبز اليومية مع تقويم نشر بسيط.',
    'اقتراح تقويم نشر لأربعة أسابيع، وكتابة نصوص قصيرة باللهجة الأردنية، وتصميم 12 منشوراً باستخدام صور يوفّرها المخبز.',
    ['تقويم نشر لمدة شهر', '12 تصميماً مع النصوص'], ['Canva', 'Copywriting', 'Photoshop'], ['التقويم والنصوص', 'التصاميم', 'المراجعة والتسليم'], 80, 14, 21, 'published', -5),
  T('clinic', 'smile', 'web', 'تحسين صفحة هبوط لعيادة أسنان', 'صفحة الحجز الحالية بطيئة وغير واضحة على الهاتف، ونريد تحسين التصميم وسرعة التحميل.',
    'مراجعة الصفحة الحالية واقتراح هيكل أوضح، ثم إعادة بنائها بشكل متجاوب مع ضغط الصور وزر حجز واضح يربط بالنموذج الحالي.',
    ['صفحة محدّثة منشورة', 'تقرير قصير بالتحسينات', 'الكود المصدري'], ['HTML', 'CSS', 'WordPress'], ['المراجعة والهيكل المقترح', 'إعادة البناء', 'الاختبار والتسليم'], 150, 21, 28, 'published', -6),
  T('template', 'darb', 'slides', 'قالب عرض لورشة تدريبية', 'قالب موحّد لعروض ورش المهارات الرقمية يستخدمه المدرّبون لاحقاً.',
    'تصميم قالب من 8 تخطيطات (غلاف، عنوان قسم، نص، صورة ونص، مقارنة، جدول، اقتباس، ختام) بألوان المنصة.',
    ['قالب Google Slides', 'نسخة PowerPoint'], ['Google Slides', 'PowerPoint'], ['التخطيطات الأساسية', 'القالب الكامل والدليل'], 50, 4, 8, 'published', -1),
  T('dashboard', 'noon', 'data', 'لوحة متابعة مبيعات أسبوعية', 'لوحة تفاعلية بسيطة تتابع مبيعات المندوبين أسبوعياً من ملف Google Sheets.',
    'ربط ملف Google Sheets بلوحة في Power BI أو Looker Studio تعرض المبيعات حسب المندوب والمنطقة والأسبوع، مع فلاتر للتاريخ.',
    ['رابط اللوحة أو ملف PBIX', 'شرح مصوّر لطريقة تحديث البيانات'], ['Power BI', 'Google Sheets', 'SQL'], ['نموذج البيانات', 'اللوحة الأولى', 'الفلاتر والتسليم'], 110, 12, 18, 'published', -7),
  T('menu', 'cafe', 'design', 'قائمة مشروبات رقمية للمقهى', 'تحويل قائمة المشروبات الورقية إلى قائمة رقمية تُعرض عبر رمز QR على الطاولات.',
    'تصميم قائمة من 4 صفحات بمقاس الهاتف تشمل المشروبات الساخنة والباردة والحلويات، بنفس هوية المقهى.',
    ['ملف PDF مناسب للهاتف', 'ملف المصدر', 'رمز QR يشير إلى الملف'], ['Figma', 'Canva'], ['الهيكل وتوزيع الأقسام', 'التصميم الكامل', 'رمز QR والتسليم'], 70, 7, 9, 'assigned', -9),
  T('branch', 'cafe', 'slides', 'عرض تقديمي لخطة افتتاح فرع جديد', 'عرض داخلي من 10 شرائح يلخّص خطة افتتاح فرع ثانٍ للمقهى بوضوح.',
    'تنظيم محتوى الخطة في 10 شرائح واضحة تتضمن الموقع المقترح والتكاليف التقديرية والجدول الزمني.',
    ['ملف PowerPoint', 'نسخة PDF'], ['PowerPoint', 'Canva'], ['هيكل العرض', 'التصميم الكامل', 'التعديلات النهائية'], 65, 5, 6, 'completed', -30),
  T('survey', 'cafe', 'data', 'تحليل استبيان رضا الزبائن', 'تحليل 140 إجابة على استبيان رضا الزبائن واستخراج أهم الملاحظات بشكل منظم.',
    'تنظيف إجابات Google Forms، وتصنيف الملاحظات المفتوحة، وإعداد ملخص بالنتائج مع رسوم بيانية بسيطة.',
    ['ملف البيانات المصنّفة', 'ملخص النتائج بصيغة PDF'], ['Excel', 'Google Sheets'], ['تنظيف الإجابات', 'التصنيف والتحليل', 'الملخص'], 85, 6, 7, 'assigned', -12),
  T('draft', 'cafe', 'web', 'صفحة حجز طاولات بسيطة للمقهى', 'نموذج حجز طاولة يرسل الطلب إلى بريد المقهى مع تأكيد للزبون.',
    'صفحة واحدة بنموذج حجز (الاسم، الهاتف، التاريخ، عدد الأشخاص) ورسالة تأكيد، متوافقة مع الهاتف.',
    ['رابط الصفحة', 'الكود المصدري'], ['HTML', 'CSS', 'JavaScript'], ['النموذج', 'الربط والتسليم'], 70, 7, 15, 'draft', -1),
];

export async function seedDev(ctx, { force = false, log = console } = {}) {
  const { db, config } = ctx;
  if (config.isProd && !config.demoMode) throw new Error('Refusing to seed fictional data into production. Use a separate demo environment with DEMO_MODE=true.');
  const existing = (await db.one('select count(*)::int as n from users')).n;
  if (existing && !force) { log.info?.('seed.skipped', { reason: 'database not empty' }); return false; }

  const password = process.env.SEED_PASSWORD || 'mihmah-demo-2026';
  const hash = await hashPassword(password);
  const ago = (days) => new Date(Date.now() + days * DAY);

  await db.tx(async (c) => {
    const user = async (email, role) => (await c.query(
      "insert into users (email, password_hash, role, email_verified_at, is_demo) values ($1, $2, $3, now(), true) returning id", [email, hash, role])).rows[0].id;

    const adminId = await user('admin@mihmah.example.com', 'admin');
    const company = {};
    for (const [key, name, contact, industry, city, bio, verification] of COMPANIES) {
      company[key] = await user(`${key}@company.example.com`, 'company');
      await c.query('insert into company_profiles (user_id, company_name, contact_name, industry, city, bio, verification_status) values ($1, $2, $3, $4, $5, $6, $7)',
        [company[key], name, contact, industry, city, bio, verification]);
      await c.query('insert into notification_preferences (user_id) values ($1)', [company[key]]);
    }
    const student = {};
    for (const [key, name, uni, major, skills, bio] of STUDENTS) {
      student[key] = await user(`${key}@student.example.com`, 'student');
      await c.query('insert into student_profiles (user_id, full_name, university, major, bio, portfolio_url) values ($1, $2, $3, $4, $5, $6)',
        [student[key], name, uni, major, bio, `https://example.com/${key}-portfolio`]);
      const ids = await upsertSkills(c, skills);
      await c.query('insert into student_skills (student_id, skill_id) select $1, unnest($2::int[])', [student[key], ids]);
      await c.query('insert into notification_preferences (user_id) values ($1)', [student[key]]);
    }

    const task = {};
    for (const t of TASKS) {
      const created = ago(t.createdDays);
      task[t.key] = (await c.query(
        `insert into tasks (company_id, title, category, summary, scope, deliverables, milestone_template, budget_amount, duration_days, deadline_at,
                            status, published_at, assigned_at, completed_at, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
        [company[t.company], t.title, t.category, t.summary, t.scope, t.deliverables, t.milestones, t.budget, t.duration, ago(t.deadlineDays),
          t.status, t.status === 'draft' ? null : created, ['assigned', 'completed'].includes(t.status) ? ago(t.createdDays + 1) : null,
          t.status === 'completed' ? ago(t.createdDays + 10) : null, created])).rows[0].id;
      const ids = await upsertSkills(c, t.skills);
      await c.query('insert into task_skills (task_id, skill_id) select $1, unnest($2::int[])', [task[t.key], ids]);
    }

    const apply = async (taskKey, studentKey, proposal, days, status, at) => (await c.query(
      'insert into applications (task_id, student_id, proposal, portfolio_url, delivery_days, status, created_at) values ($1, $2, $3, $4, $5, $6, $7) returning id',
      [task[taskKey], student[studentKey], proposal, `https://example.com/${studentKey}-portfolio`, days, status, at])).rows[0].id;

    await apply('posts', 'sara', 'صممت سابقاً محتوى لمقهيين في إربد، وأقترح البدء بلوحة مزاجية تعتمد ألوان الشعار الحالية ثم تسليم منشورين للمراجعة خلال يومين.', 6, 'submitted', ago(-1));
    await apply('posts', 'yazan', 'أستطيع كتابة نصوص قصيرة مرافقة للتصاميم إلى جانب العمل على Canva، وسأشارك المسودة الأولى بعد ثلاثة أيام من البدء.', 7, 'submitted', ago(-0.5));

    // Projects in different states, created the same way the API would.
    const project = async ({ taskKey, studentKey, companyKey, status, started, completed, ms, messages, deliverables, review }) => {
      const appId = await apply(taskKey, studentKey, 'أقترح خطة عمل واضحة على مراحل مع مراجعة بعد كل مرحلة لضمان مطابقة النتيجة لما تحتاجونه.', 5, 'offered', ago(started - 1));
      const offerId = (await c.query(
        "insert into offers (task_id, application_id, company_id, student_id, status, expires_at, responded_at, created_at) values ($1, $2, $3, $4, 'accepted', $5, $6, $7) returning id",
        [task[taskKey], appId, company[companyKey], student[studentKey], ago(started + 2), ago(started), ago(started - 0.5)])).rows[0].id;
      const pid = (await c.query(
        'insert into projects (task_id, offer_id, company_id, student_id, status, started_at, completed_at) values ($1, $2, $3, $4, $5, $6, $7) returning id',
        [task[taskKey], offerId, company[companyKey], student[studentKey], status, ago(started), completed ? ago(completed) : null])).rows[0].id;
      const conv = (await c.query('insert into conversations (project_id) values ($1) returning id', [pid])).rows[0].id;
      const tpl = TASKS.find((x) => x.key === taskKey).milestones;
      for (let i = 0; i < tpl.length; i++) {
        await c.query('insert into milestones (project_id, title, position, done_at) values ($1, $2, $3, $4)', [pid, tpl[i], i + 1, i < ms ? ago(started + i + 1) : null]);
      }
      for (const [from, body, at] of messages) {
        await c.query('insert into messages (conversation_id, sender_id, body, created_at) values ($1, $2, $3, $4)', [conv, from === 'student' ? student[studentKey] : company[companyKey], body, ago(at)]);
      }
      for (const [round, note, links, at, decision, feedback] of deliverables) {
        const did = (await c.query('insert into deliverables (project_id, round, note, links, submitted_by, created_at) values ($1, $2, $3, $4, $5, $6) returning id',
          [pid, round, note, links, student[studentKey], ago(at)])).rows[0].id;
        if (decision) await c.query('insert into deliverable_reviews (deliverable_id, decision, feedback, reviewer_id, created_at) values ($1, $2, $3, $4, $5)', [did, decision, feedback, company[companyKey], ago(at + 1)]);
      }
      if (review) await c.query('insert into reviews (project_id, reviewer_id, reviewee_id, rating, comment, created_at) values ($1, $2, $3, $4, $5, $6)', [pid, company[companyKey], student[studentKey], review[0], review[1], ago(completed)]);
      const t = TASKS.find((x) => x.key === taskKey);
      const pay = (await c.query(
        'insert into payments (task_id, project_id, company_id, student_id, amount, platform_fee, provider, status) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, status',
        [task[taskKey], pid, company[companyKey], student[studentKey], t.budget, ctx.payments.feeFor(t.budget), ctx.payments.provider, ctx.payments.initialStatus])).rows[0];
      await c.query("insert into payment_events (payment_id, type, to_status, source) values ($1, 'payment.record_created', $2, 'system')", [pay.id, pay.status]);
      return pid;
    };

    await project({
      taskKey: 'menu', studentKey: 'lian', companyKey: 'cafe', status: 'in_progress', started: -3, ms: 1,
      messages: [['company', 'أهلاً ليان، أرسلنا لكِ أسماء المشروبات والأسعار المحدّثة. هل تحتاجين أي شيء آخر قبل البدء؟', -2.9], ['student', 'شكراً! وصلتني القائمة، وأنهيت توزيع الأقسام. سأشارك التصميم الكامل قريباً.', -2]],
      deliverables: [],
    });
    await project({
      taskKey: 'branch', studentKey: 'lian', companyKey: 'cafe', status: 'completed', started: -27, completed: -20, ms: 3,
      messages: [['company', 'شكراً على العرض، سنستخدمه في اجتماع الشركاء.', -20]],
      deliverables: [
        [1, 'النسخة الأولى من العرض كاملة مع ملاحظات المتحدث.', ['https://example.com/branch-plan-v1.pdf'], -23, 'revision_requested', 'نرجو تبسيط شريحة التكاليف وإضافة جدول زمني مختصر.'],
        [2, 'عدّلت شريحة التكاليف وأضفت جدولاً زمنياً مختصراً.', ['https://example.com/branch-plan-v2.pdf'], -21, 'approved', 'عرض منظّم وواضح، والتزام ممتاز بالمواعيد.'],
      ],
      review: [5, 'عرض منظّم وواضح، والتزام ممتاز بالمواعيد وتجاوب سريع مع الملاحظات.'],
    });
    await project({
      taskKey: 'survey', studentKey: 'omar', companyKey: 'cafe', status: 'awaiting_review', started: -6, ms: 3,
      messages: [['student', 'سلّمت الملخص، وجاهز لأي ملاحظات.', -1]],
      deliverables: [[1, 'أرفقت الملخص وملف البيانات المصنّفة. أبرز ملاحظة: سرعة الخدمة وقت الذروة.', ['https://example.com/survey-summary.pdf'], -1]],
    });

    await c.query("insert into audit_events (actor_id, action, entity_type, metadata) values ($1, 'seed.dev_data_loaded', 'system', '{}')", [adminId]);
  });
  log.info?.('seed.done', { password: '[see SEED_PASSWORD or README]' });
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ctx = createContext();
  await migrate(ctx.config.databaseUrl, { info() {} });
  try {
    const done = await seedDev(ctx, { force: process.argv.includes('--force') });
    console.log(done ? 'Seeded fictional demo data.' : 'Database already has users; nothing seeded (use --force on an empty-ish dev DB at your own risk).');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await ctx.db.end();
  }
}
