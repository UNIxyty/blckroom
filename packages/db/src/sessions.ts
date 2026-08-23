import type { SessionStatus } from "@blackroom/shared";
import { getPool } from "./client.js";

export interface SessionRow {
  id: string;
  shop_id: string;
  barber_id: string;
  source_image_path: string | null;
  status: SessionStatus;
  consent_given_at: Date;
  sheet_image_path: string | null;
  cost_cents: number;
  created_at: Date;
  expires_at: Date;
  tg_chat_id: string | null;
  tg_progress_message_id: string | null;
}

export async function createSession(args: {
  shopId: string;
  barberId: string;
  retentionHours: number;
}): Promise<SessionRow> {
  const { rows } = await getPool().query<SessionRow>(
    `insert into sessions (shop_id, barber_id, consent_given_at, expires_at)
     values ($1, $2, now(), now() + make_interval(hours => $3))
     returning *`,
    [args.shopId, args.barberId, args.retentionHours],
  );
  return rows[0]!;
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const { rows } = await getPool().query<SessionRow>("select * from sessions where id = $1", [id]);
  return rows[0] ?? null;
}

export async function setSessionSource(id: string, path: string): Promise<void> {
  await getPool().query(
    "update sessions set source_image_path = $2, status = 'uploaded' where id = $1",
    [id, path],
  );
}

export async function setSessionStatus(id: string, status: SessionStatus): Promise<void> {
  await getPool().query("update sessions set status = $2 where id = $1", [id, status]);
}

export async function setSessionDelivery(
  id: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  await getPool().query(
    "update sessions set tg_chat_id = $2, tg_progress_message_id = $3 where id = $1",
    [id, chatId, messageId],
  );
}

export async function listBarberSessions(barberId: string, days: number): Promise<SessionRow[]> {
  const { rows } = await getPool().query<SessionRow>(
    `select * from sessions
     where barber_id = $1 and created_at > now() - make_interval(days => $2)
     order by created_at desc`,
    [barberId, days],
  );
  return rows;
}

/** Every Storage path a session owns (source, raw, framed, sheet). */
export async function listSessionImagePaths(sessionId: string): Promise<string[]> {
  const { rows } = await getPool().query<{ path: string }>(
    `select source_image_path as path from sessions where id = $1 and source_image_path is not null
     union all
     select sheet_image_path from sessions where id = $1 and sheet_image_path is not null
     union all
     select raw_image_path from generations where session_id = $1 and raw_image_path is not null
     union all
     select framed_image_path from generations where session_id = $1 and framed_image_path is not null`,
    [sessionId],
  );
  return rows.map((r) => r.path);
}

/** Null all image paths and mark expired; the row survives for stats. */
export async function stripSessionImagery(sessionId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `update generations set raw_image_path = null, framed_image_path = null
     where session_id = $1`,
    [sessionId],
  );
  await pool.query(
    `update sessions set source_image_path = null, sheet_image_path = null, status = 'expired'
     where id = $1`,
    [sessionId],
  );
}

/** Sessions past expiry that still hold imagery. */
export async function listExpiredSessionsWithImagery(limit = 50): Promise<SessionRow[]> {
  const { rows } = await getPool().query<SessionRow>(
    `select * from sessions
     where expires_at < now() and status <> 'expired'
        and (source_image_path is not null or sheet_image_path is not null
             or exists (select 1 from generations g
                        where g.session_id = sessions.id
                          and (g.raw_image_path is not null or g.framed_image_path is not null)))
     limit $1`,
    [limit],
  );
  return rows;
}

export async function listBarberSessionIds(barberId: string): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    "select id from sessions where barber_id = $1 and status <> 'expired'",
    [barberId],
  );
  return rows.map((r) => r.id);
}

export async function countBarberSessionsToday(
  barberId: string,
  timezone: string,
): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    `select count(*) as n from sessions
     where barber_id = $1
       and created_at >= date_trunc('day', now() at time zone $2) at time zone $2`,
    [barberId, timezone],
  );
  return Number(rows[0]!.n);
}
