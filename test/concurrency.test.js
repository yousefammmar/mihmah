// Two students race to accept offers for the same single-assignee task: exactly one may win.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, signUp, taskBody, proposal } from './helpers.js';

let s; let company; let students;
before(async () => {
  s = await startStack();
  company = await signUp(s, 'company');
  students = [];
  for (let i = 0; i < 4; i++) students.push(await signUp(s, 'student', { name: `طالب ${i}` }));
});
after(async () => { await s?.stop(); });

for (let round = 1; round <= 5; round++) {
  test(`concurrent acceptances, round ${round}: one project, one accepted offer, the rest withdrawn`, async () => {
    const t = await company.post('/api/tasks', taskBody());
    const offers = [];
    for (const st of students) {
      const a = await st.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
      offers.push((await company.post(`/api/applications/${a.data.id}/offer`, {})).data.id);
    }
    const results = await Promise.all(students.map((st, i) => st.post(`/api/offers/${offers[i]}/accept`)));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409, 409, 409], JSON.stringify(results.map((r) => r.data)));
    assert.ok(results.filter((r) => r.status === 409).every((r) => ['task_taken', 'invalid_transition'].includes(r.data.error.code)));

    const projects = await s.sql('select id from projects where task_id = $1', [t.data.id]);
    assert.equal(projects.length, 1);
    const os = await s.sql('select status, count(*)::int as n from offers where task_id = $1 group by status order by status', [t.data.id]);
    assert.deepEqual(os, [{ status: 'accepted', n: 1 }, { status: 'withdrawn', n: 3 }]);
    const [task] = await s.sql('select status from tasks where id = $1', [t.data.id]);
    assert.equal(task.status, 'assigned');
  });
}

test('database constraint backs the rule even if application code were bypassed', async () => {
  const t = await company.post('/api/tasks', taskBody());
  const ids = [];
  for (const st of students.slice(0, 2)) {
    const a = await st.post(`/api/tasks/${t.data.id}/applications`, { proposal, deliveryDays: 5 });
    ids.push((await company.post(`/api/applications/${a.data.id}/offer`, {})).data.id);
  }
  await s.sql("update offers set status = 'accepted' where id = $1", [ids[0]]);
  await assert.rejects(s.sql("update offers set status = 'accepted' where id = $1", [ids[1]]), /offers_one_accepted_per_task/);
});
