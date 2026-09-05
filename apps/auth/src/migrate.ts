import "dotenv/config";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const migrationLockName = "helpthehive-auth-migrations";

function migrationsDirectory() {
  if (process.env.MIGRATIONS_DIR) {
    return path.resolve(process.env.MIGRATIONS_DIR);
  }

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDirectory, "../migrations");
}

async function ensureLedger(client: PoolClient) {
  await client.query(`
    create table if not exists "_auth_migrations" (
      "name" text primary key,
      "checksum" text not null,
      "appliedAt" timestamptz not null default now()
    )
  `);
}

async function applyMigration(client: PoolClient, name: string, sql: string) {
  const checksum = createHash("sha256").update(sql).digest("hex");
  const applied = await client.query<{ checksum: string }>(
    `select "checksum" from "_auth_migrations" where "name" = $1`,
    [name],
  );

  if (applied.rowCount) {
    if (applied.rows[0].checksum !== checksum) {
      throw new Error(`applied migration ${name} has been modified`);
    }
    console.log(`already applied: ${name}`);
    return;
  }

  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      `insert into "_auth_migrations" ("name", "checksum") values ($1, $2)`,
      [name, checksum],
    );
    await client.query("commit");
    console.log(`applied: ${name}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function run() {
  const databaseURL = process.env.DATABASE_URL?.trim();
  if (!databaseURL) {
    throw new Error("DATABASE_URL is required");
  }

  const directory = migrationsDirectory();
  const migrations = (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));

  const pool = new Pool({ connectionString: databaseURL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [migrationLockName]);
    await ensureLedger(client);
    for (const name of migrations) {
      await applyMigration(client, name, await readFile(path.join(directory, name), "utf8"));
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext($1))", [migrationLockName]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
