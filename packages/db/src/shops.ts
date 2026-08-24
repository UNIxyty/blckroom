import { getPool } from "./client.js";

export interface ShopRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  currency: string;
  monthly_budget_cents: number;
  timezone: string;
  created_at: Date;
  retention_hours: number;
  test_image_path: string | null;
}

export async function setShopTestImage(id: string, path: string): Promise<void> {
  await getPool().query("update shops set test_image_path = $2 where id = $1", [id, path]);
}

/** Editor test generations in the last hour — the rate-limit source of truth. */
export async function countRecentTestGenerations(shopId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    `select count(*) as n from audit_log
     where shop_id = $1 and action = 'haircut.test'
       and created_at > now() - interval '1 hour'`,
    [shopId],
  );
  return Number(rows[0]!.n);
}

export async function getShop(id: string): Promise<ShopRow | null> {
  const { rows } = await getPool().query<ShopRow>("select * from shops where id = $1", [id]);
  return rows[0] ?? null;
}

export async function getDefaultShop(): Promise<ShopRow> {
  // Single-shop deployment today; approvals attach pending users to this shop.
  const { rows } = await getPool().query<ShopRow>(
    "select * from shops order by created_at limit 1",
  );
  const shop = rows[0];
  if (!shop) throw new Error("no shop seeded — run pnpm db:seed");
  return shop;
}

/**
 * Sessions + spend for the shop's current calendar month (shop timezone).
 * Spend includes editor test generations (audited as haircut.test with a
 * cost_cents meta) so they count toward the cap like any other Gemini call.
 */
export async function monthlyUsage(shopId: string): Promise<{ sessions: number; spend_cents: number }> {
  const { rows } = await getPool().query<{ sessions: string; spend_cents: string }>(
    `select count(*) as sessions, coalesce(sum(cost_cents), 0) as spend_cents
     from sessions s
     join shops sh on sh.id = s.shop_id
     where s.shop_id = $1
       and s.created_at >= date_trunc('month', now() at time zone sh.timezone) at time zone sh.timezone`,
    [shopId],
  );
  const { rows: test } = await getPool().query<{ test_cents: string }>(
    `select coalesce(sum((a.meta->>'cost_cents')::int), 0) as test_cents
     from audit_log a
     join shops sh on sh.id = a.shop_id
     where a.shop_id = $1 and a.action = 'haircut.test'
       and a.created_at >= date_trunc('month', now() at time zone sh.timezone) at time zone sh.timezone`,
    [shopId],
  );
  return {
    sessions: Number(rows[0]!.sessions),
    spend_cents: Number(rows[0]!.spend_cents) + Number(test[0]!.test_cents),
  };
}
