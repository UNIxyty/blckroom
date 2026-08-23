import type { JobStatus, JobType } from "@blackroom/shared";
import { getPool } from "./client.js";

export interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  locked_at: Date | null;
  locked_by: string | null;
  run_after: Date;
  last_error: string | null;
  created_at: Date;
}

const MAX_ATTEMPTS = 3;
/** A job locked longer than this is presumed crashed and re-queued. */
const STALE_LOCK_MINUTES = 5;

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  runAfterSeconds = 0,
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `insert into jobs (type, payload, run_after)
     values ($1, $2, now() + make_interval(secs => $3))
     returning id`,
    [type, JSON.stringify(payload), runAfterSeconds],
  );
  return rows[0]!.id;
}

/** At most one compose_sheet per session (unique partial index absorbs races). */
export async function enqueueComposeSheetOnce(sessionId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `insert into jobs (type, payload)
     values ('compose_sheet', jsonb_build_object('session_id', $1::text))
     on conflict do nothing`,
    [sessionId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Claim up to `limit` runnable jobs with FOR UPDATE SKIP LOCKED, marking them
 * running in the same transaction. Also rescues stale locks from crashed workers.
 */
export async function claimJobs(limit: number, lockedBy: string): Promise<JobRow[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `update jobs set status = 'queued', locked_at = null, locked_by = null
       where status = 'running' and locked_at < now() - make_interval(mins => $1)`,
      [STALE_LOCK_MINUTES],
    );

    const { rows } = await client.query<JobRow>(
      `select * from jobs
       where status = 'queued' and run_after <= now()
       order by run_after
       limit $1
       for update skip locked`,
      [limit],
    );

    if (rows.length > 0) {
      await client.query(
        `update jobs set status = 'running', locked_at = now(), locked_by = $2,
                         attempts = attempts + 1
         where id = any($1::uuid[])`,
        [rows.map((r) => r.id), lockedBy],
      );
    }

    await client.query("commit");
    return rows.map((r) => ({ ...r, attempts: r.attempts + 1 }));
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function completeJob(id: string): Promise<void> {
  await getPool().query(
    "update jobs set status = 'done', locked_at = null, locked_by = null where id = $1",
    [id],
  );
}

/** Retry with backoff until MAX_ATTEMPTS, then dead. */
export async function failJob(job: JobRow, error: string): Promise<"retried" | "dead"> {
  if (job.attempts >= MAX_ATTEMPTS) {
    await getPool().query(
      `update jobs set status = 'dead', last_error = $2, locked_at = null, locked_by = null
       where id = $1`,
      [job.id, error.slice(0, 2000)],
    );
    return "dead";
  }
  const backoffSeconds = 2 ** job.attempts; // 2, 4
  await getPool().query(
    `update jobs set status = 'queued', last_error = $2, locked_at = null, locked_by = null,
                     run_after = now() + make_interval(secs => $3)
     where id = $1`,
    [job.id, error.slice(0, 2000), backoffSeconds],
  );
  return "retried";
}
