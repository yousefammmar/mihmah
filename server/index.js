import { createContext, expireOffers } from './context.js';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';

let ctx;
try {
  ctx = createContext();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const { config, log, db } = ctx;

if (process.env.MIGRATE_ON_START !== 'false') await migrate(config.databaseUrl, log);

const server = createApp(ctx).listen(config.port, () => {
  log.info('server.started', { port: config.port, env: config.nodeEnv, mail: ctx.mailer.provider, storage: ctx.storage.driver, payments: ctx.payments.provider, demoMode: config.demoMode });
});

const sweep = setInterval(() => expireOffers(db).catch((err) => log.error('offers.expire_failed', { err })), 60_000);

function shutdown(signal) {
  log.info('server.stopping', { signal });
  clearInterval(sweep);
  server.close(() => db.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
