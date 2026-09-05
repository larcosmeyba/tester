import "dotenv/config";

import { Pool } from "pg";

import { env } from "./env.js";

const pool = new Pool({ connectionString: env.databaseURL });

try {
  const result = await pool.query('delete from "session"');
  console.info("auth_sessions_invalidated", { count: result.rowCount ?? 0 });
} finally {
  await pool.end();
}
