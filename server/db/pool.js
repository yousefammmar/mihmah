import pg from 'pg';

// numeric -> string by default in pg; budgets are parsed to Number at the API edge where needed.
export function createDb(databaseUrl, log) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  pool.on('error', (err) => log?.error('db.pool_error', { err }));

  // Runs fn inside a transaction. Side effects (SSE pushes, emails) registered via `after` run only after COMMIT.
  async function tx(fn) {
    const client = await pool.connect();
    const after = [];
    try {
      await client.query('begin');
      const result = await fn(client, (cb) => after.push(cb));
      await client.query('commit');
      for (const cb of after) {
        try { await cb(); } catch (err) { log?.error('tx.after_failed', { err }); }
      }
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    query: (text, params) => pool.query(text, params),
    one: async (text, params) => (await pool.query(text, params)).rows[0] || null,
    tx,
    end: () => pool.end(),
  };
}
