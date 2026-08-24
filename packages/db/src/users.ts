import type { Role, UserStatus } from "@blackroom/shared";
import { getPool } from "./client.js";

export interface UserRow {
  id: string;
  telegram_id: string; // bigint comes back as string
  username: string | null;
  first_name: string | null;
  shop_id: string | null;
  role: Role;
  status: UserStatus;
  created_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
  language: "en" | "ru" | null;
}

export async function setUserLanguage(userId: string, language: "en" | "ru"): Promise<void> {
  await getPool().query("update users set language = $2 where id = $1", [userId, language]);
}

export async function findUserByTelegramId(telegramId: number | string): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "select * from users where telegram_id = $1",
    [telegramId.toString()],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>("select * from users where id = $1", [id]);
  return rows[0] ?? null;
}

/** Create a pending user, or return the existing row (refreshing tg profile fields). */
export async function upsertPendingUser(
  telegramId: number,
  username: string | null,
  firstName: string | null,
): Promise<{ user: UserRow; created: boolean }> {
  const { rows } = await getPool().query<UserRow & { inserted: boolean }>(
    `insert into users (telegram_id, username, first_name)
     values ($1, $2, $3)
     on conflict (telegram_id) do update
       set username = excluded.username, first_name = excluded.first_name
     returning *, (xmax = 0) as inserted`,
    [telegramId.toString(), username, firstName],
  );
  const row = rows[0]!;
  return { user: row, created: row.inserted };
}

export async function approveUser(
  userId: string,
  shopId: string,
  approvedBy: string,
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    `update users
       set role = 'barber', status = 'active', shop_id = $2, approved_by = $3, approved_at = now()
     where id = $1 and role = 'pending'
     returning *`,
    [userId, shopId, approvedBy],
  );
  return rows[0] ?? null;
}

export async function rejectUser(userId: string, rejectedBy: string): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    `update users
       set status = 'suspended', approved_by = $2, approved_at = now()
     where id = $1 and role = 'pending' and status = 'pending'
     returning *`,
    [userId, rejectedBy],
  );
  return rows[0] ?? null;
}

export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    "update users set status = $2 where id = $1 returning *",
    [userId, status],
  );
  return rows[0] ?? null;
}

/** Owners + superadmins who should be notified about a shop (superadmins always). */
export async function listApprovers(): Promise<UserRow[]> {
  const { rows } = await getPool().query<UserRow>(
    `select * from users
     where role in ('owner','superadmin') and status = 'active'`,
  );
  return rows;
}

export async function listUsersByStatus(status: UserStatus): Promise<UserRow[]> {
  const { rows } = await getPool().query<UserRow>(
    "select * from users where status = $1 order by created_at",
    [status],
  );
  return rows;
}

export async function listShopUsers(shopId: string): Promise<UserRow[]> {
  const { rows } = await getPool().query<UserRow>(
    `select * from users
     where shop_id = $1 or (role = 'pending' and shop_id is null)
     order by status, created_at`,
    [shopId],
  );
  return rows;
}
