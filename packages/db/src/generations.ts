import type { GenerationStatus } from "@blackroom/shared";
import { getPool } from "./client.js";

export interface GenerationRow {
  id: string;
  session_id: string;
  haircut_id: string;
  status: GenerationStatus;
  raw_image_path: string | null;
  framed_image_path: string | null;
  cost_cents: number;
  error: string | null;
  attempt: number;
  created_at: Date;
  completed_at: Date | null;
}

export interface GenerationWithCut extends GenerationRow {
  name_en: string;
  name_ru: string | null;
  prompt: string;
  price_cents: number;
  duration_minutes: number;
  sort_order: number;
}

export async function createGenerations(
  sessionId: string,
  haircutIds: string[],
): Promise<GenerationRow[]> {
  const { rows } = await getPool().query<GenerationRow>(
    `insert into generations (session_id, haircut_id)
     select $1, unnest($2::uuid[])
     returning *`,
    [sessionId, haircutIds],
  );
  return rows;
}

export async function getGenerationWithCut(id: string): Promise<GenerationWithCut | null> {
  const { rows } = await getPool().query<GenerationWithCut>(
    `select g.*, h.name_en, h.name_ru, h.prompt, h.price_cents,
            h.duration_minutes, h.sort_order
     from generations g join haircuts h on h.id = g.haircut_id
     where g.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listSessionGenerations(sessionId: string): Promise<GenerationWithCut[]> {
  const { rows } = await getPool().query<GenerationWithCut>(
    `select g.*, h.name_en, h.name_ru, h.prompt, h.price_cents,
            h.duration_minutes, h.sort_order
     from generations g join haircuts h on h.id = g.haircut_id
     where g.session_id = $1
     order by h.sort_order`,
    [sessionId],
  );
  return rows;
}

export async function markGenerationRunning(id: string): Promise<void> {
  await getPool().query(
    "update generations set status = 'running', attempt = attempt + 1 where id = $1",
    [id],
  );
}

export async function markGenerationDone(
  id: string,
  rawPath: string,
  framedPath: string,
  costCents: number,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `update generations
       set status = 'done', raw_image_path = $2, framed_image_path = $3,
           cost_cents = $4, completed_at = now(), error = null
     where id = $1`,
    [id, rawPath, framedPath, costCents],
  );
  await pool.query(
    `update sessions set cost_cents = cost_cents + $2
     where id = (select session_id from generations where id = $1)`,
    [id, costCents],
  );
}

export async function markGenerationFailed(id: string, error: string): Promise<void> {
  await getPool().query(
    `update generations set status = 'failed', error = $2, completed_at = now()
     where id = $1`,
    [id, error.slice(0, 2000)],
  );
}

/** true when every generation for the session is done or failed. */
export async function allGenerationsSettled(sessionId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ unsettled: string }>(
    `select count(*) filter (where status in ('queued','running')) as unsettled
     from generations where session_id = $1`,
    [sessionId],
  );
  return Number(rows[0]!.unsettled) === 0;
}

export async function countDoneGenerations(sessionId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    `select count(*) as n from generations where session_id = $1 and status = 'done'`,
    [sessionId],
  );
  return Number(rows[0]!.n);
}
