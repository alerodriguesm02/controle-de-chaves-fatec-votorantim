import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";

export async function openDatabase(url, file) {
  let sqlite, pool;
  if (url) pool = new pg.Pool({ connectionString: url });
  else {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    sqlite = new DatabaseSync(file);
    sqlite.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
  }
  function adapter(client) {
    async function query(sql, params = [], write = false) {
      if (sqlite) return sqlite.prepare(sql)[write ? "run" : "all"](...params);
      let i = 0;
      const result = await client.query(
        sql.replace(/\?/g, () => "$" + ++i),
        params,
      );
      return result.rows;
    }
    return {
      all: query,
      one: async (...args) => (await query(...args))[0],
      run: (sql, ...p) => query(sql, p, true),
    };
  }
  let queue = Promise.resolve();
  async function transaction(fn) {
    const pgClient = pool && (await pool.connect());
    const control = (sql) => (sqlite ? sqlite.exec(sql) : pgClient.query(sql));
    try {
      await control(sqlite ? "BEGIN IMMEDIATE" : "BEGIN");
      // Serialize short custody transactions across application instances in this single-unit deployment.
      if (pool) await control("SELECT pg_advisory_xact_lock(7102471)");
      const result = await fn(adapter(pgClient));
      await control("COMMIT");
      return result;
    } catch (error) {
      await control("ROLLBACK");
      throw error;
    } finally {
      pgClient?.release();
    }
  }
  const schema = readFileSync(new URL("schema.sql", import.meta.url), "utf8");
  if (sqlite) sqlite.exec(schema);
  else await pool.query(schema);
  await transaction(async (d) => {
    const applied = await d.one(
      "SELECT value FROM app_meta WHERE name='schema'",
    );
    if (!applied) {
      await d.run("ALTER TABLE loans ADD COLUMN voided_at TEXT");
      await d.run(
        "CREATE UNIQUE INDEX active_custody ON loans(key_id) WHERE returned IS NULL AND voided_at IS NULL",
      );
      await d.run("DROP INDEX IF EXISTS one_open_loan");
      await d.run("INSERT INTO app_meta VALUES (?,?)", "schema", "2");
    }
    if (!applied || applied.value === "2") {
      await d.run("ALTER TABLE loans ADD COLUMN contingency_out INTEGER NOT NULL DEFAULT 0");
      await d.run("ALTER TABLE loans ADD COLUMN contingency_in INTEGER NOT NULL DEFAULT 0");
      await d.run("UPDATE app_meta SET value='3' WHERE name='schema'");
    }
  });
  return {
    tx(fn) {
      if (pool) return transaction(fn);
      const job = queue.then(() => transaction(fn));
      queue = job.catch(() => {});
      return job;
    },
    close: () => (sqlite ? sqlite.close() : pool.end()),
  };
}
