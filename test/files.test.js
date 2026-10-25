// Private attachments: type/size checks, generated storage keys, participant-only short-lived links.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startStack, signUp, startProject } from './helpers.js';
import { presignS3 } from '../server/lib/storage.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

let s; let company; let student; let outsider; let p;
const upload = (c, buf, name) => c.req('POST', `/api/projects/${p}/attachments`, buf, { raw: true, headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) } });

before(async () => {
  s = await startStack({ MAX_UPLOAD_MB: '1', FILE_URL_TTL_SECONDS: '2' });
  company = await signUp(s, 'company');
  student = await signUp(s, 'student');
  outsider = await signUp(s, 'student');
  ({ projectId: p } = await startProject(s, company, student));
});
after(async () => { await s?.stop(); });

test('upload validates type by extension and content; SVG and mismatched files are refused', async () => {
  assert.equal((await upload(student, Buffer.from('<svg onload=alert(1)>'), 'x.svg')).status, 415);
  assert.equal((await upload(student, Buffer.from('not really a png'), 'fake.png')).status, 415);
  assert.equal((await upload(student, Buffer.alloc(0), 'empty.png')).status, 400);
  assert.equal((await upload(student, Buffer.alloc(1024 * 1024 + 10, 1), 'big.txt')).status, 413);
  assert.equal((await upload(outsider, PNG, 'logo.png')).status, 404);
});

test('stored files live outside public/ under a generated key, never the user-supplied name', async () => {
  const r = await upload(student, PNG, '../../etc/شعار نهائي.png');
  assert.equal(r.status, 201);
  assert.equal(r.data.mimeType, 'image/png');
  const [row] = await s.sql('select storage_key, original_name from attachments where id = $1', [r.data.id]);
  assert.match(row.storage_key, /^projects\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  assert.ok(!row.original_name.includes('/'));
  const onDisk = path.join(s.env.STORAGE_LOCAL_DIR, row.storage_key);
  assert.deepEqual(await fs.readFile(onDisk), PNG);
  assert.ok(!onDisk.includes(`${path.sep}public${path.sep}`));
});

test('download links are short-lived, bound to the requesting participant, and forced as attachments', async () => {
  const up = await upload(student, PNG, 'design.png');
  await student.post(`/api/projects/${p}/messages`, { body: 'المسودة مرفقة', attachmentIds: [up.data.id] });
  const msgs = await company.get(`/api/projects/${p}/messages`);
  assert.equal(msgs.data.items.at(-1).attachments[0].id, up.data.id);

  const link = await company.post(`/api/attachments/${up.data.id}/link`);
  assert.equal(link.status, 200);
  const dl = await company.get(link.data.url);
  assert.equal(dl.status, 200);
  assert.deepEqual(dl.data, PNG);
  assert.match(dl.headers.get('content-disposition'), /^attachment;/);
  assert.match(dl.headers.get('content-security-policy'), /sandbox/);

  assert.equal((await student.get(link.data.url)).status, 403, 'link is bound to the user it was issued to');
  assert.equal((await outsider.post(`/api/attachments/${up.data.id}/link`)).status, 404);
  assert.equal((await s.client().get(link.data.url)).status, 401);

  await new Promise((r) => setTimeout(r, 2200));
  assert.equal((await company.get(link.data.url)).status, 403, 'expired link');
});

test('attachments cannot be reused or linked across projects', async () => {
  const up = await upload(student, PNG, 'once.png');
  assert.equal((await student.post(`/api/projects/${p}/messages`, { body: 'أول استخدام', attachmentIds: [up.data.id] })).status, 201);
  assert.equal((await student.post(`/api/projects/${p}/messages`, { body: 'استخدام ثانٍ', attachmentIds: [up.data.id] })).status, 400);
  const other = await startProject(s, company, outsider);
  assert.equal((await outsider.post(`/api/projects/${other.projectId}/deliverables`, { note: 'محاولة ربط ملف غريب', links: [], attachmentIds: [up.data.id] })).status, 400);
});

test('S3 presigner matches the AWS SigV4 documented example', () => {
  const url = presignS3({
    method: 'GET', key: 'test.txt', bucket: 'examplebucket', endpoint: 'https://s3.amazonaws.com', region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    forcePathStyle: false, expires: 86400, now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.ok(url.startsWith('https://examplebucket.s3.amazonaws.com/test.txt?'));
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
});
