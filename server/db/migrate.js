// Applies server/db/migrations/*.sql in filename order, once each, under an advisory lock.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(databaseUrl, log = console) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { server_encoding: enc } = (await client.query('show server_encoding')).rows[0];
    if (enc !== 'UTF8') throw new Error(`Database encoding is ${enc}; Mihmah stores Arabic text and requires a UTF8 database (createdb --encoding=UTF8 --template=template0).`);
    await client.query('select pg_advisory_lock(727274)');
    await client.query('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select version from schema_migrations')).rows.map((r) => r.version));
    const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await fs.readFile(path.join(DIR, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
        log.info?.('migration.applied', { file });
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock(727274)').catch(() => {});
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  migrate(process.env.DATABASE_URL, { info: (m, f) => console.log(m, f.file) })
    .then((applied) => console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.'))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
