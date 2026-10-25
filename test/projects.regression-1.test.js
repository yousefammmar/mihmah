// Regression: ISSUE-005 — milestone PATCH was all-or-nothing: a due-date-only edit got 400 "title required",
// and a title-only edit silently cleared the due date
// Found by /qa on 2026-10-25
// Report: .gstack/qa-reports/run-20261025T160958Z/qa-report-localhost-2026-10-25.md
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, signUp, startProject, futureDate } from './helpers.js';

let s; let company; let student;
before(async () => { s = await startStack(); company = await signUp(s, 'company'); student = await signUp(s, 'student'); });
after(async () => { await s?.stop(); });

const milestone = async (p, id) => (await company.get(`/api/projects/${p}`)).data.milestones.find((m) => m.id === id);

test('milestone PATCH updates only the fields that were sent', async () => {
  const { projectId: p } = await startProject(s, company, student);
  const m = (await company.post(`/api/projects/${p}/milestones`, { title: 'مراجعة الألوان', dueDate: futureDate(5) })).data;

  assert.equal((await company.patch(`/api/milestones/${m.id}`, { dueDate: futureDate(9) })).status, 200, 'due-date-only edit');
  const moved = await milestone(p, m.id);
  assert.equal(moved.title, 'مراجعة الألوان');
  assert.ok(new Date(moved.dueAt) > new Date(m.dueAt), 'due date moved later');

  assert.equal((await company.patch(`/api/milestones/${m.id}`, { title: 'مراجعة الألوان النهائية' })).status, 200, 'title-only edit');
  const renamed = await milestone(p, m.id);
  assert.equal(renamed.title, 'مراجعة الألوان النهائية');
  assert.equal(renamed.dueAt, moved.dueAt, 'a title-only edit must keep the due date');

  assert.equal((await company.patch(`/api/milestones/${m.id}`, { dueDate: null })).status, 200);
  assert.equal((await milestone(p, m.id)).dueAt, null, 'an explicit null clears the due date');
  assert.equal((await company.patch(`/api/milestones/${m.id}`, { title: 'x' })).status, 400, 'a sent title is still validated');
});
