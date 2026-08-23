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

export async function createHaircut(
  shopId: string,
  fields: {
    name_en: string;
    prompt: string;
    name_lv?: string | null | undefined;
    name_ru?: string | null | undefined;
    price_cents?: number | undefined;
    duration_minutes?: number | undefined;
  },
): Promise<HaircutRow> {
  const { rows } = await getPool().query<HaircutRow>(
    `insert into haircuts (shop_id, name_en, prompt, name_lv, name_ru, price_cents, duration_minutes, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7,
             (select coalesce(max(sort_order), 0) + 1 from haircuts where shop_id = $1))
     returning *`,
    [
      shopId,
      fields.name_en,
      fields.prompt,
      fields.name_lv ?? null,
      fields.name_ru ?? null,
      fields.price_cents ?? 0,
      fields.duration_minutes ?? 30,
    ],
  );
  return rows[0]!;
}

export async function updateHaircut(
  id: string,
  patch: {
    [K in
      | "name_en"
      | "name_lv"
      | "name_ru"
      | "prompt"
      | "price_cents"
      | "duration_minutes"
      | "is_active"
      | "reference_image_url"]?: HaircutRow[K] | undefined;
  },
): Promise<HaircutRow | null> {
  const { rows } = await getPool().query<HaircutRow>(
    `update haircuts set
       name_en = coalesce($2, name_en),
       name_lv = coalesce($3, name_lv),
       name_ru = coalesce($4, name_ru),
       prompt = coalesce($5, prompt),
       price_cents = coalesce($6, price_cents),
       duration_minutes = coalesce($7, duration_minutes),
       is_active = coalesce($8, is_active),
       reference_image_url = coalesce($9, reference_image_url)
     where id = $1
     returning *`,
    [
      id,
      patch.name_en ?? null,
      patch.name_lv ?? null,
      patch.name_ru ?? null,
      patch.prompt ?? null,
      patch.price_cents ?? null,
      patch.duration_minutes ?? null,
      patch.is_active ?? null,
      patch.reference_image_url ?? null,
    ],
  );
  return rows[0] ?? null;
}

/** Reorder: ids in desired order; anything not listed keeps its place after. */
export async function reorderHaircuts(shopId: string, orderedIds: string[]): Promise<void> {
  await getPool().query(
    `update haircuts h
       set sort_order = x.ord
     from (select unnest($2::uuid[]) as id, generate_series(1, array_length($2::uuid[], 1)) as ord) x
     where h.id = x.id and h.shop_id = $1`,
    [shopId, orderedIds],
  );
}
