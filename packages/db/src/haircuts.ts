import { getPool } from "./client.js";

export interface HaircutRow {
  id: string;
  shop_id: string;
  name_lv: string | null;
  name_ru: string | null;
  name_en: string;
  prompt: string;
  reference_image_url: string | null;
  price_cents: number;
  duration_minutes: number;
  sort_order: number;
  is_active: boolean;
}

export async function listActiveHaircuts(shopId: string): Promise<HaircutRow[]> {
  const { rows } = await getPool().query<HaircutRow>(
    "select * from haircuts where shop_id = $1 and is_active order by sort_order",
    [shopId],
  );
  return rows;
}

export async function listAllHaircuts(shopId: string): Promise<HaircutRow[]> {
  const { rows } = await getPool().query<HaircutRow>(
    "select * from haircuts where shop_id = $1 order by sort_order",
    [shopId],
  );
  return rows;
}

export async function getHaircut(id: string): Promise<HaircutRow | null> {
  const { rows } = await getPool().query<HaircutRow>("select * from haircuts where id = $1", [id]);
  return rows[0] ?? null;
}
