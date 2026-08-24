import { getPool } from "./client.js";

export interface HaircutRow {
  id: string;
  shop_id: string;
  name_ru: string | null;
  name_en: string;
  prompt: string;
  reference_image_url: string | null;
  price_cents: number;
  duration_minutes: number;
  sort_order: number;
  is_active: boolean;
  deleted_at: Date | null;
}

export async function listActiveHaircuts(shopId: string): Promise<HaircutRow[]> {
  const { rows } = await getPool().query<HaircutRow>(
    `select * from haircuts
     where shop_id = $1 and is_active and deleted_at is null
     order by sort_order`,
    [shopId],
  );
  return rows;
}

export async function listAllHaircuts(shopId: string): Promise<HaircutRow[]> {
  const { rows } = await getPool().query<HaircutRow>(
    "select * from haircuts where shop_id = $1 and deleted_at is null order by sort_order",
    [shopId],
  );
  return rows;
}

export async function countActiveHaircuts(shopId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    "select count(*) as n from haircuts where shop_id = $1 and is_active and deleted_at is null",
    [shopId],
  );
  return Number(rows[0]!.n);
}

/** Name uniqueness among the shop's non-deleted cuts (case-insensitive). */
export async function haircutNameTaken(
  shopId: string,
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const { rows } = await getPool().query<{ n: string }>(
    `select count(*) as n from haircuts
     where shop_id = $1 and deleted_at is null and lower(name_en) = lower($2)
       and ($3::uuid is null or id <> $3)`,
    [shopId, name, excludeId ?? null],
  );
  return Number(rows[0]!.n) > 0;
}

/** Soft delete: past sessions keep their generations; new sessions skip it. */
export async function softDeleteHaircut(id: string): Promise<void> {
  await getPool().query(
    "update haircuts set deleted_at = now(), is_active = false where id = $1",
    [id],
  );
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
    name_ru?: string | null | undefined;
    price_cents?: number | undefined;
    duration_minutes?: number | undefined;
  },
): Promise<HaircutRow> {
  const { rows } = await getPool().query<HaircutRow>(
    `insert into haircuts (shop_id, name_en, prompt, name_ru, price_cents, duration_minutes, sort_order)
     values ($1, $2, $3, $4, $5, $6,
             (select coalesce(max(sort_order), 0) + 1 from haircuts where shop_id = $1))
     returning *`,
    [
      shopId,
      fields.name_en,
      fields.prompt,
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
       name_ru = coalesce($3, name_ru),
       prompt = coalesce($4, prompt),
       price_cents = coalesce($5, price_cents),
       duration_minutes = coalesce($6, duration_minutes),
       is_active = coalesce($7, is_active),
       reference_image_url = coalesce($8, reference_image_url)
     where id = $1
     returning *`,
    [
      id,
      patch.name_en ?? null,
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
