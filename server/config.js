// Reads configuration from environment variables. Production refuses to start with unsafe defaults.
import crypto from 'node:crypto';
import path from 'node:path';

const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => (v == null || v === '' ? d : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const appUrl = (env.APP_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, '');

  const config = {
    nodeEnv,
    isProd,
    isTest: nodeEnv === 'test',
    port: int(env.PORT, 3000),
    appUrl,
    databaseUrl: env.DATABASE_URL,
    allowedOrigins: (env.ALLOWED_ORIGINS || new URL(appUrl).origin).split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: bool(env.TRUST_PROXY),
    logLevel: env.LOG_LEVEL || (nodeEnv === 'test' ? 'error' : 'info'),

    session: {
      cookieName: env.SESSION_COOKIE_NAME || 'mihmah_sid',
      ttlHours: int(env.SESSION_TTL_HOURS, 24 * 7),
      idleHours: int(env.SESSION_IDLE_HOURS, 48),
      secureCookie: bool(env.COOKIE_SECURE, isProd),
    },
    // HMAC key for short-lived download links. A random per-process key is fine in development.
    fileUrlSecret: env.FILE_URL_SECRET || crypto.randomBytes(32).toString('hex'),
    fileUrlTtlSeconds: int(env.FILE_URL_TTL_SECONDS, 120),
    maxUploadBytes: int(env.MAX_UPLOAD_MB, 10) * 1024 * 1024,

    mail: {
      provider: env.MAIL_PROVIDER || 'dev',
      from: env.MAIL_FROM || 'Mihmah <no-reply@localhost>',
      devDir: path.resolve(env.DEV_MAIL_DIR || 'storage/dev-mail'),
      smtp: {
        host: env.SMTP_HOST,
        port: int(env.SMTP_PORT, 587),
        secure: bool(env.SMTP_SECURE),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    },

    storage: {
      driver: env.STORAGE_DRIVER || 'local',
      localDir: path.resolve(env.STORAGE_LOCAL_DIR || 'storage/private'),
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION || 'us-east-1',
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, true),
      },
    },

    payments: {
      provider: env.PAYMENTS_PROVIDER || 'none',
      platformFeePercent: Number(env.PLATFORM_FEE_PERCENT ?? 10),
    },

    offerTtlHours: int(env.OFFER_TTL_HOURS, 72),
    demoMode: bool(env.DEMO_MODE),
  };

  const problems = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL is required');
  if (!['dev', 'smtp'].includes(config.mail.provider)) problems.push('MAIL_PROVIDER must be dev or smtp');
  if (!['local', 's3'].includes(config.storage.driver)) problems.push('STORAGE_DRIVER must be local or s3');
  if (!['none', 'sandbox'].includes(config.payments.provider)) problems.push('PAYMENTS_PROVIDER must be none or sandbox (live providers are not integrated)');
  if (config.mail.provider === 'smtp' && !config.mail.smtp.host) problems.push('SMTP_HOST is required when MAIL_PROVIDER=smtp');
  if (config.storage.driver === 's3') {
    for (const k of ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey']) if (!config.storage.s3[k]) problems.push(`S3 ${k} is required when STORAGE_DRIVER=s3`);
  }
  if (isProd) {
    if (!appUrl.startsWith('https://')) problems.push('APP_URL must use https in production');
    if (!env.FILE_URL_SECRET || env.FILE_URL_SECRET.length < 32) problems.push('FILE_URL_SECRET (32+ chars) is required in production');
    if (config.mail.provider !== 'smtp') problems.push('Production email requires MAIL_PROVIDER=smtp with a configured provider');
    if (config.storage.driver !== 's3') problems.push('Production requires STORAGE_DRIVER=s3 (private object storage)');
    if (!config.session.secureCookie) problems.push('COOKIE_SECURE cannot be disabled in production');
    if (config.payments.provider === 'sandbox' && !config.demoMode) problems.push('PAYMENTS_PROVIDER=sandbox is only allowed in non-production or demo environments');
  }
  if (problems.length) {
    const err = new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    err.code = 'CONFIG';
    throw err;
  }
  return config;
}
