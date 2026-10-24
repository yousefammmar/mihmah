// Single source of truth, persisted to localStorage. All counts in the UI are derived from these records.
// Role checks below are prototype behaviour in one browser, not secure authorisation.
import { createSeed } from './data.js';

const KEY = 'mihmah:state:v1';
const listeners = new Set();
let state = load();
let saveFailed = false;

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed && parsed.version === 1) return parsed;
  } catch { /* corrupt or unavailable storage: fall back to seed */ }
  return createSeed();
}

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    saveFailed = true; // UI shows a warning; data still lives in memory for this tab
  }
  listeners.forEach((fn) => fn());
}

export const storageFailed = () => saveFailed;
export const subscribe = (fn) => listeners.add(fn);
export const getState = () => state;

const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

// ---------- selectors ----------
export const session = () => state.session;
export const role = () => state.session.role;
export const studentById = (id) => state.students.find((s) => s.id === id);
export const companyById = (id) => state.companies.find((c) => c.id === id);
export const taskById = (id) => state.tasks.find((t) => t.id === id);
export const projectById = (id) => state.projects.find((p) => p.id === id);
export const projectForTask = (taskId) => state.projects.find((p) => p.taskId === taskId);
export const currentStudent = () => studentById(state.session.studentId);
export const currentCompany = () => companyById(state.session.companyId);
export const currentUser = () => (role() === 'student' ? currentStudent() : role() === 'company' ? currentCompany() : null);

export const openTasks = () => state.tasks.filter((t) => t.status === 'open');
export const applicationsForTask = (taskId) => state.applications.filter((a) => a.taskId === taskId);
export const applicationOf = (taskId, studentId) => state.applications.find((a) => a.taskId === taskId && a.studentId === studentId);
export const studentApplications = (studentId) =>
  state.applications.filter((a) => a.studentId === studentId).sort(byNewest);
export const companyTasks = (companyId) => state.tasks.filter((t) => t.companyId === companyId).sort(byNewest);
export const studentProjects = (studentId) => state.projects.filter((p) => p.studentId === studentId);
export const companyProjects = (companyId) => state.projects.filter((p) => p.companyId === companyId);
export const savedIds = () => state.saved[state.session.studentId] || [];
export const isSaved = (taskId) => savedIds().includes(taskId);

export function myProjects() {
  return role() === 'student' ? studentProjects(state.session.studentId) : companyProjects(state.session.companyId);
}

export function myNotifications() {
  const r = role();
  const id = r === 'student' ? state.session.studentId : state.session.companyId;
  return state.notifications.filter((n) => n.role === r && n.userId === id).sort(byNewest);
}

export function completedFor(studentId) {
  return studentProjects(studentId).filter((p) => p.status === 'completed').sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

function byNewest(a, b) {
  return (b.createdAt || b.at || '').localeCompare(a.createdAt || a.at || '');
}

// ---------- guards ----------
function fail(msg) { throw new Error(msg); }
function asStudent() {
  if (role() !== 'student') fail('هذا الإجراء متاح في وضع الطالب فقط.');
  return currentStudent();
}
function asCompany() {
  if (role() !== 'company') fail('هذا الإجراء متاح في وضع الشركة فقط.');
  return currentCompany();
}
function participantRole(project) {
  if (role() === 'student' && project.studentId === state.session.studentId) return 'student';
  if (role() === 'company' && project.companyId === state.session.companyId) return 'company';
  return null;
}

function notify(r, userId, text, link) {
  state.notifications.push({ id: uid('n'), role: r, userId, text, link, at: nowIso(), read: false });
}
function log(project, text) {
  project.activity.push({ text, at: nowIso() });
}

// ---------- session & profiles ----------
export function enterDemo(r) {
  state.session.role = r;
  if (r === 'student') state.session.studentId = 's-demo';
  else state.session.companyId = 'c-demo';
  commit();
}

export function switchRole(r) {
  state.session.role = r;
  commit();
}

export function exitDemo() {
  state.session.role = null;
  commit();
}

export function createProfile(r, data) {
  if (r === 'student') {
    const s = { id: uid('s'), ...data };
    state.students.push(s);
    state.session.studentId = s.id;
  } else {
    const c = { id: uid('c'), ...data };
    state.companies.push(c);
    state.session.companyId = c.id;
  }
  state.session.role = r;
  commit();
}

export function updateProfile(data) {
  const user = currentUser();
  if (!user) fail('لا يوجد ملف نشط.');
  Object.assign(user, data);
  commit();
}

export function toggleSaved(taskId) {
  const s = asStudent();
  const list = state.saved[s.id] || (state.saved[s.id] = []);
  const i = list.indexOf(taskId);
  if (i >= 0) list.splice(i, 1); else list.push(taskId);
  commit();
  return i < 0;
}

export function markNotificationRead(id) {
  const n = state.notifications.find((x) => x.id === id);
  if (n && !n.read) { n.read = true; commit(); }
}

export function markNotificationsRead() {
  myNotifications().forEach((n) => { n.read = true; });
  commit();
}

export function resetDemo() {
  const r = state.session.role;
  state = createSeed();
  state.session.role = r;
  commit();
}

// ---------- workflow ----------
export function publishTask(data) {
  const c = asCompany();
  const t = { id: uid('t'), companyId: c.id, status: 'open', createdAt: nowIso(), ...data };
  state.tasks.push(t);
  commit();
  return t;
}

export function applyToTask(taskId, { proposal, portfolioUrl, deliveryDays }) {
  const s = asStudent();
  const t = taskById(taskId);
  if (!t || t.status !== 'open') fail('هذه المهمة لم تعد تستقبل طلبات.');
  if (applicationOf(taskId, s.id)) fail('لقد تقدّمت لهذه المهمة مسبقاً.');
  const a = { id: uid('a'), taskId, studentId: s.id, status: 'pending', proposal, portfolioUrl, deliveryDays, createdAt: nowIso() };
  state.applications.push(a);
  notify('company', t.companyId, `تقدّم ${s.name} لمهمة «${t.title}»`, `/company/tasks/${t.id}`);
  commit();
  return a;
}

export function selectApplicant(applicationId) {
  const c = asCompany();
  const a = state.applications.find((x) => x.id === applicationId);
  const t = a && taskById(a.taskId);
  if (!t || t.companyId !== c.id) fail('لا يمكنك اختيار متقدّم لمهمة لا تملكها.');
  if (t.status !== 'open' || a.status !== 'pending') fail('تم اختيار متقدّم لهذه المهمة مسبقاً.');
  const s = studentById(a.studentId);

  applicationsForTask(t.id).forEach((x) => {
    x.status = x.id === a.id ? 'accepted' : 'rejected';
    if (x.id !== a.id) notify('student', x.studentId, `لم يتم اختيارك لمهمة «${t.title}». يمكنك التقدّم لمهام أخرى.`, '/applications');
  });
  t.status = 'in_progress';
  const p = {
    id: uid('p'), taskId: t.id, applicationId: a.id, studentId: s.id, companyId: c.id,
    status: 'in_progress', startedAt: nowIso(), completedAt: null,
    milestones: t.milestones.map((title) => ({ title, done: false })),
    submissions: [], feedback: null, revisionNote: null, messages: [], activity: [],
  };
  log(p, `تم اختيار ${s.name} وبدء المشروع`);
  state.projects.push(p);
  notify('student', s.id, `تم اختيارك لمهمة «${t.title}». المشروع جاهز للبدء.`, `/projects/${p.id}`);
  commit();
  return p;
}

export function toggleMilestone(projectId, index) {
  const p = projectById(projectId);
  if (!p || participantRole(p) !== 'student') fail('يحدّث الطالب المراحل فقط.');
  if (!['in_progress', 'revision'].includes(p.status)) fail('لا يمكن تعديل المراحل في هذه الحالة.');
  const m = p.milestones[index];
  m.done = !m.done;
  log(p, m.done ? `أنجز الطالب مرحلة «${m.title}»` : `أعاد الطالب فتح مرحلة «${m.title}»`);
  commit();
}

export function submitWork(projectId, { links, note, attachments }) {
  const p = projectById(projectId);
  if (!p || participantRole(p) !== 'student') fail('يسلّم الطالب المختار العمل فقط.');
  if (!['in_progress', 'revision'].includes(p.status)) fail('لا يمكن التسليم في هذه الحالة.');
  const round = p.submissions.length + 1;
  p.submissions.push({ id: uid('sub'), round, links, note, attachments, at: nowIso() });
  p.status = 'review';
  log(p, `سلّم الطالب الجولة ${round}`);
  notify('company', p.companyId, `سُلّم عمل جديد في «${taskById(p.taskId).title}» وينتظر مراجعتك`, `/projects/${p.id}`);
  commit();
}

export function requestRevision(projectId, feedback) {
  const p = projectById(projectId);
  if (!p || participantRole(p) !== 'company') fail('تطلب الشركة صاحبة المهمة التعديلات فقط.');
  if (p.status !== 'review') fail('لا يوجد تسليم بانتظار المراجعة.');
  p.status = 'revision';
  p.revisionNote = feedback;
  log(p, 'طلبت الشركة تعديلات');
  notify('student', p.studentId, `طُلبت تعديلات على «${taskById(p.taskId).title}»`, `/projects/${p.id}`);
  commit();
}

export function approveProject(projectId, { rating, text }) {
  const p = projectById(projectId);
  if (!p || participantRole(p) !== 'company') fail('تعتمد الشركة صاحبة المهمة الإنجاز فقط.');
  if (p.status !== 'review') fail('لا يوجد تسليم بانتظار الاعتماد.');
  p.status = 'completed';
  p.completedAt = nowIso();
  p.feedback = { rating, text, at: p.completedAt };
  p.milestones.forEach((m) => { m.done = true; });
  taskById(p.taskId).status = 'completed';
  log(p, 'اعتمدت الشركة الإنجاز');
  notify('student', p.studentId, `اعتُمد إنجاز «${taskById(p.taskId).title}» وأضيف إلى ملفك`, '/portfolio');
  commit();
}

export function sendMessage(projectId, text) {
  const p = projectById(projectId);
  const from = p && participantRole(p);
  if (!from) fail('الرسائل متاحة لطرفي المشروع فقط.');
  p.messages.push({ id: uid('m'), from, text, at: nowIso() });
  const title = taskById(p.taskId).title;
  if (from === 'student') notify('company', p.companyId, `رسالة جديدة من الطالب في «${title}»`, `/projects/${p.id}`);
  else notify('student', p.studentId, `رسالة جديدة من الشركة في «${title}»`, `/projects/${p.id}`);
  commit();
}
