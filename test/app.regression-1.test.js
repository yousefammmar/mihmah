// Regression: ISSUE-002 — the dev mail outbox (verify/reset links) was readable from any machine on the LAN
// Found by /qa on 2026-10-25
// Report: .gstack/qa-reports/run-20261025T160958Z/qa-report-localhost-2026-10-25.md
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { startStack, signUp } from './helpers.js';

const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address;

let s;
before(async () => { s = await startStack(); await signUp(s, 'student'); });
after(async () => { await s?.stop(); });

test('dev outbox is served to loopback only', { skip: !lanIp && 'no non-loopback IPv4 interface' }, async () => {
  const port = s.server.address().port;
  const local = await fetch(`http://127.0.0.1:${port}/dev/mail`);
  assert.equal(local.status, 200);
  assert.match(await local.text(), /verify-email/);

  const lan = await fetch(`http://${lanIp}:${port}/dev/mail`);
  assert.equal(lan.status, 404, 'a LAN client must not read verification or reset links');
  assert.doesNotMatch(await lan.text(), /verify-email|reset-password/);
});
