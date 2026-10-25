// Builds the shared dependencies (config, db, adapters) used by the app, scripts and tests.
import { loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';
import { createDb } from './db/pool.js';
import { createMailer } from './lib/mailer.js';
import { createStorage } from './lib/storage.js';
import { createPayments } from './lib/payments.js';
import { createEventHub } from './lib/events.js';
import { createRateLimiter } from './lib/rateLimit.js';

export function createContext(env = process.env, overrides = {}) {
  const config = loadConfig(env);
  const log = overrides.log || createLogger(config.logLevel);
  const ctx = {
    config,
    log,
    db: createDb(config.databaseUrl, log),
    mailer: createMailer(config, log),
    storage: createStorage(config),
    payments: createPayments(config),
    events: createEventHub(log),
    limiter: createRateLimiter(),
    ...overrides,
  };
  return ctx;
}

// Expires pending offers whose deadline passed (also enforced inside the accept transaction).
export async function expireOffers(db) {
  await db.query("update offers set status = 'expired', responded_at = now() where status = 'pending' and expires_at <= now()");
}
