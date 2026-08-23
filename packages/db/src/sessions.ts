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
