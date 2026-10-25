// Private object storage. "local" keeps files in a directory outside public/ (development);
// "s3" talks to any S3-compatible bucket with SigV4 presigned URLs (no SDK dependency).
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createStorage(config) {
  return config.storage.driver === 's3' ? s3Storage(config.storage.s3) : localStorage(config.storage.localDir);
}

function localStorage(root) {
  const resolve = (key) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return p;
  };
  return {
    driver: 'local',
    async put(key, buffer) {
      const p = resolve(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, buffer, { flag: 'wx' });
    },
    async stream(key) { return createReadStream(resolve(key)); },
    async remove(key) { await fs.rm(resolve(key), { force: true }); },
  };
}

// ---------- S3 SigV4 (query-string auth) ----------
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

export function presignS3({ method, key, bucket, endpoint, region, accessKeyId, secretAccessKey, forcePathStyle, expires = 60, query = {}, now = new Date() }) {
  const base = new URL(endpoint);
  const host = forcePathStyle ? base.host : `${bucket}.${base.host}`;
  const keyPath = key.split('/').map(enc).join('/');
  const canonicalUri = forcePathStyle ? `/${enc(bucket)}/${keyPath}` : `/${keyPath}`;
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const params = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${base.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function s3Storage(s3) {
  const sign = (method, key, opts = {}) => presignS3({ method, key, ...s3, ...opts });
  return {
    driver: 's3',
    async put(key, buffer, mime) {
      const res = await fetch(sign('PUT', key), { method: 'PUT', body: buffer, headers: { 'content-type': mime } });
      if (!res.ok) throw new Error(`S3 upload failed (${res.status})`);
    },
    // Short-lived download URL that forces the original filename and type.
    downloadUrl(key, { filename, mime, expires }) {
      return sign('GET', key, {
        expires,
        query: {
          'response-content-disposition': `attachment; filename*=UTF-8''${enc(filename)}`,
          'response-content-type': mime,
        },
      });
    },
    async remove(key) {
      await fetch(sign('DELETE', key), { method: 'DELETE' });
    },
  };
}
