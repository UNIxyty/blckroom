import pg from "pg";
import { loadConfig } from "@blackroom/shared/config";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const config = loadConfig();
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      // Supabase poolers sit behind TLS; sslmode in the URL wins if present.
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
