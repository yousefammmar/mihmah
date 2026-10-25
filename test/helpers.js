// Test harness: a throwaway PostgreSQL cluster (embedded-postgres, real Postgres binaries) per test file,
// the real Express app on a random port, and cookie-jar HTTP clients that behave like separate browsers.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../server/db/migrate.js';
import { createContext } from '../server/context.js';
import { createApp } from '../server/app.js';

export const ORIGIN = 'http://localhost:4010';

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

export async function startStack(envOverrides = {}) {
  const pgPort = await freePort();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mihmah-test-'));
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(root, 'pg'), port: pgPort, user: 'postgres', password: 'test-only',
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('mihmah_test');
  const env = {
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://postgres:test-only@127.0.0.1:${pgPort}/mihmah_test`,
    APP_URL: ORIGIN,
    MAIL_PROVIDER: 'dev',
    DEV_MAIL_DIR: path.join(root, 'mail'),
    STORAGE_LOCAL_DIR: path.join(root, 'files'),
    PAYMENTS_PROVIDER: 'sandbox',
    LOG_LEVEL: 'error',
    ...envOverrides,
  };
  await migrate(env.DATABASE_URL, { info() {} });

  const stack = { env, root, pg };
  stack.boot = async () => {
    stack.ctx = createContext(env);
    stack.server = createApp(stack.ctx).listen(0);
    await new Promise((r) => stack.server.once('listening', r));
    stack.base = `http://127.0.0.1:${stack.server.address().port}`;
  };
  stack.halt = async () => {
    await new Promise((r) => stack.server.close(r));
    stack.server.closeAllConnections?.();
    await stack.ctx.db.end();
  };
  stack.stop = async () => {
    await stack.halt();
    await pg.stop();
    await fs.rm(root, { recursive: true, force: true });
  };
  stack.client = () => new Client(stack);
  stack.sql = (text, params) => stack.ctx.db.query(text, params).then((r) => r.rows);
  // Reads the newest dev-outbox mail for an address and extracts its token.
  stack.tokenFor = async (email) => {
    const dir = env.DEV_MAIL_DIR;
    const files = (await fs.readdir(dir)).sort().reverse();
    for (const f of files) {
      const m = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      if (m.to === email) return decodeURIComponent(/token=([^\s]+)/.exec(m.text)[1]);
    }
    throw new Error(`No mail for ${email}`);
  };
  await stack.boot();
  return stack;
}

export class Client {
  constructor(stack) { this.stack = stack; this.cookies = new Map(); this.csrf = null; }

  async req(method, url, body, { headers = {}, raw = false, origin = ORIGIN, noCsrf = false } = {}) {
    const h = { ...headers };
    if (origin) h.origin = origin;
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (this.csrf && !noCsrf) h['x-csrf-token'] = this.csrf;
    let payload = body;
    if (body !== undefined && !raw) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.stack.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(k); else this.cookies.set(k, v);
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (data && typeof data === 'object' && 'csrf' in data && data.csrf) this.csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }

  get(u, o) { return this.req('GET', u, undefined, o); }
  post(u, b = {}, o) { return this.req('POST', u, b, o); }
  put(u, b = {}, o) { return this.req('PUT', u, b, o); }
  patch(u, b = {}, o) { return this.req('PATCH', u, b, o); }
  del(u, o) { return this.req('DELETE', u, undefined, o); }
}

let seq = 0;
export const uniqueEmail = (prefix) => `${prefix}.${Date.now()}.${seq++}@example.com`;
export const PASSWORD = 'correct horse battery';

// Registers, verifies the email through the dev outbox, and returns a signed-in client.
export async function signUp(stack, role, overrides = {}) {
  const c = stack.client();
  stack.ctx.limiter.reset(); // every test user comes from 127.0.0.1, which would trip the per-IP limits
  const email = overrides.email || uniqueEmail(role);
  const body = role === 'company'
    ? { role, email, password: PASSWORD, name: 'رنا حدّاد', companyName: overrides.companyName || 'مقهى الاختبار' }
    : { role, email, password: PASSWORD, name: overrides.name || 'طالب اختبار' };
  const r = await c.post('/api/auth/register', body);
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.data)}`);
  if (overrides.verify !== false) {
    const v = await c.post('/api/auth/verify-email', { token: await stack.tokenFor(email) });
    if (v.status !== 200) throw new Error(`verify failed ${JSON.stringify(v.data)}`);
  }
  c.email = email;
  c.userId = r.data.user.id;
  return c;
}

export const futureDate = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

export function taskBody(overrides = {}) {
  return {
    title: 'تصميم 8 منشورات لمقهى في عمّان',
    category: 'design',
    summary: 'نحتاج 8 تصاميم لمنشورات إنستغرام تعرّف بقائمة الشتاء الجديدة للمقهى.',
    scope: 'تصميم 8 منشورات مربعة بالاعتماد على الشعار والألوان الحالية مع جولة تعديل واحدة.',
    deliverables: ['8 تصاميم PNG', 'ملف المصدر'],
    skills: ['Figma', 'Canva'],
    milestones: ['مسودة أولى', 'التسليم النهائي'],
    budget: 60,
    durationDays: 7,
    deadline: futureDate(14),
    publish: true,
    ...overrides,
  };
}

export const proposal = 'أقترح البدء بلوحة مزاجية تعتمد ألوان الشعار ثم تسليم منشورين للمراجعة خلال يومين، ثم البقية.';

// Company publishes, student applies, company offers, student accepts -> returns ids.
export async function startProject(stack, company, student, taskOverrides = {}) {
  const t = await company.post('/api/tasks', taskBody(taskOverrides));
  const a = await student.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
  const o = await company.post(`/api/applications/${a.data.id}/offer`, { message: 'نرحب بك' });
  const acc = await student.post(`/api/offers/${o.data.id}/accept`);
  if (acc.status !== 200) throw new Error(`accept failed ${JSON.stringify(acc.data)}`);
  return { taskId: t.data.id, applicationId: a.data.id, offerId: o.data.id, projectId: acc.data.projectId };
}
