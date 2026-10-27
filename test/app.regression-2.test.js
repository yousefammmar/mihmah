// Regression: after a deploy, browsers kept the old site for up to an hour (static files sent with max-age=3600),
// so new features (the theme button) didn't show, and old and new ES modules could mix and break the page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startStack } from './helpers.js';

// Plain http GET: fetch() adds "Cache-Control: no-cache" to conditional requests, which defeats revalidation.
const get = (url, headers = {}) => new Promise((resolve, reject) => {
  http.get(url, { headers }, (res) => { res.resume(); res.on('end', () => resolve(res)); }).on('error', reject);
});

let s;
before(async () => { s = await startStack({ NODE_ENV: 'production', APP_URL: 'https://mihmah.example.com', FILE_URL_SECRET: 'x'.repeat(40), MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com', STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://s3.example.com', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', PAYMENTS_PROVIDER: 'none' }); });
after(async () => { await s?.stop(); });

test('static files are revalidated on every load in production, and unchanged files answer 304', async () => {
  for (const path of ['/', '/js/app.js', '/css/tokens.css']) {
    const res = await get(s.base + path);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['cache-control'], /max-age=0/, `${path} must not be cached for a fixed time`);
    const again = await get(s.base + path, { 'if-none-match': res.headers.etag });
    assert.equal(again.statusCode, 304, `${path} revalidation stays cheap`);
  }
});
