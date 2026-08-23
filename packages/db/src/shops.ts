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

export async function updateShopSettings(
  id: string,
  patch: {
    name?: string | undefined;
    currency?: string | undefined;
    retention_hours?: number | undefined;
    monthly_budget_cents?: number | undefined;
  },
): Promise<ShopRow | null> {
  const { rows } = await getPool().query<ShopRow>(
    `update shops set
       name = coalesce($2, name),
       currency = coalesce($3, currency),
       retention_hours = coalesce($4, retention_hours),
       monthly_budget_cents = coalesce($5, monthly_budget_cents)
     where id = $1
     returning *`,
    [id, patch.name ?? null, patch.currency ?? null, patch.retention_hours ?? null, patch.monthly_budget_cents ?? null],
  );
  return rows[0] ?? null;
}

/** Sessions + spend for the shop's current calendar month (shop timezone). */
export async function monthlyUsage(shopId: string): Promise<{ sessions: number; spend_cents: number }> {
  const { rows } = await getPool().query<{ sessions: string; spend_cents: string }>(
    `select count(*) as sessions, coalesce(sum(cost_cents), 0) as spend_cents
     from sessions s
     join shops sh on sh.id = s.shop_id
     where s.shop_id = $1
       and s.created_at >= date_trunc('month', now() at time zone sh.timezone) at time zone sh.timezone`,
    [shopId],
  );
  return {
    sessions: Number(rows[0]!.sessions),
    spend_cents: Number(rows[0]!.spend_cents),
  };
}
