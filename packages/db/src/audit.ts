import { getPool } from "./client.js";

export async function audit(entry: {
  shopId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await getPool().query(
    `insert into audit_log (shop_id, actor_user_id, action, target_type, target_id, meta)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entry.shopId ?? null,
      entry.actorUserId ?? null,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ],
  );
}
