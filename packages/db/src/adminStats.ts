import { getPool } from "./client.js";

export interface UserStats {
  sessions: number;
  spend_cents: number;
}

export async function userStats(userId: string): Promise<UserStats> {
  const { rows } = await getPool().query<{ sessions: string; spend_cents: string }>(
    `select count(*) as sessions, coalesce(sum(cost_cents), 0) as spend_cents
     from sessions where barber_id = $1`,
    [userId],
  );
  return { sessions: Number(rows[0]!.sessions), spend_cents: Number(rows[0]!.spend_cents) };
}

export async function sessionsToday(
  shopId: string,
  timezone: string,
): Promise<{ sessions: number; barbers: number }> {
  const { rows } = await getPool().query<{ sessions: string; barbers: string }>(
    `select count(*) as sessions, count(distinct barber_id) as barbers
     from sessions
     where shop_id = $1
       and created_at >= date_trunc('day', now() at time zone $2) at time zone $2`,
    [shopId, timezone],
  );
  return { sessions: Number(rows[0]!.sessions), barbers: Number(rows[0]!.barbers) };
}

export interface AdminSessionRow {
  id: string;
  status: string;
  created_at: Date;
  expires_at: Date;
  cost_cents: number;
  barber_name: string | null;
  barber_username: string | null;
  done_count: number;
  total_count: number;
  has_imagery: boolean;
}

export async function listShopSessions(shopId: string, days: number): Promise<AdminSessionRow[]> {
  const { rows } = await getPool().query<AdminSessionRow>(
    `select s.id, s.status, s.created_at, s.expires_at, s.cost_cents,
            u.first_name as barber_name, u.username as barber_username,
            count(g.id) filter (where g.status = 'done')::int as done_count,
            count(g.id)::int as total_count,
            (s.source_image_path is not null or s.sheet_image_path is not null) as has_imagery
     from sessions s
     join users u on u.id = s.barber_id
     left join generations g on g.session_id = s.id
     where s.shop_id = $1 and s.created_at > now() - make_interval(days => $2)
     group by s.id, u.first_name, u.username
     order by s.created_at desc
     limit 100`,
    [shopId, days],
  );
  return rows;
}

export interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  created_at: Date;
  actor_name: string | null;
  actor_username: string | null;
  meta: Record<string, unknown>;
}

export async function listAudit(shopId: string, limit = 60): Promise<AuditRow[]> {
  const { rows } = await getPool().query<AuditRow>(
    `select a.id, a.action, a.target_type, a.created_at, a.meta,
            u.first_name as actor_name, u.username as actor_username
     from audit_log a
     left join users u on u.id = a.actor_user_id
     where a.shop_id = $1 or a.shop_id is null
     order by a.created_at desc
     limit $2`,
    [shopId, limit],
  );
  return rows;
}

/** Active owner-level accounts other than `excludeUserId` (superadmin counts). */
export async function countOtherActiveOwners(excludeUserId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    `select count(*) as n from users
     where role in ('owner', 'superadmin') and status = 'active' and id <> $1`,
    [excludeUserId],
  );
  return Number(rows[0]!.n);
}
