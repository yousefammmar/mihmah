// Local development launcher.
// If DATABASE_URL is not set, starts a real PostgreSQL from the embedded-postgres dev dependency in .data/pg
// (no Docker or system install needed), runs migrations, seeds fictional data on first run, then starts the server.
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV ||= 'development';

if (!process.env.DATABASE_URL) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = path.resolve('.data/pg');
  const port = Number(process.env.EMBEDDED_PG_PORT || 54329);
  const pg = new EmbeddedPostgres({
    databaseDir: dir, port, user: 'mihmah', password: 'mihmah-local-dev', persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], // Arabic text functions need a UTF8 database
    onLog: () => {}, onError: (e) => { if (process.env.DEBUG_PG) console.error(String(e)); },
  });
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  await pg.createDatabase('mihmah_dev').catch(() => {});
  process.env.DATABASE_URL = `postgres://mihmah:mihmah-local-dev@127.0.0.1:${port}/mihmah_dev`;
  console.log(`Embedded PostgreSQL running on 127.0.0.1:${port} (data in .data/pg)`);
  const stop = () => pg.stop().finally(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const { migrate } = await import('../server/db/migrate.js');
await migrate(process.env.DATABASE_URL, { info: (m, f) => console.log(m, f?.file || '') });

if (process.env.NODE_ENV !== 'production' && process.env.SEED_ON_START !== 'false') {
  const { createContext } = await import('../server/context.js');
  const { seedDev } = await import('../server/db/seed-dev.js');
  const ctx = createContext();
  if (await seedDev(ctx, { log: { info() {} } })) console.log('Seeded fictional demo data (password: SEED_PASSWORD or mihmah-demo-2026).');
  await ctx.db.end();
}

process.env.MIGRATE_ON_START = 'false';
await import('../server/index.js');
