import { loadConfig } from "@blackroom/shared/config";
import { getPool, closePool } from "./client.js";

/**
 * Idempotent seed: shop, superadmin, nine haircuts.
 * haircuts.prompt holds only the HAIRCUT_DESCRIPTION — the guardrail template
 * around it lives in code (packages/shared) so it can be improved globally.
 */
const HAIRCUTS: Array<{ name: string; prompt: string }> = [
  {
    name: "Buzz Cut",
    prompt:
      "a buzz cut: one uniform clipper length of about 4mm over the entire head, clean sharp edges around the ears and neckline",
  },
  {
    name: "Crew Cut",
    prompt:
      "a crew cut: short tapered back and sides, top slightly longer at 2-3cm and brushed forward-flat, clean natural neckline",
  },
  {
    name: "French Crop",
    prompt:
      "a french crop: short textured top with a blunt straight fringe across the forehead, sides and back faded short",
  },
  {
    name: "Mid Fade with Textured Top",
    prompt:
      "a mid fade with textured top: sides faded from skin at mid-ear up into a choppy, matte-textured top of 5-7cm with visible separation between strands",
  },
  {
    name: "Skin Fade, Short Top",
    prompt:
      "a high skin fade with a short top: sides and back shaved to bare skin blending up high, top cropped very short at 1-2cm",
  },
  {
    name: "Undercut",
    prompt:
      "an undercut: sides and back clipped to one short uniform length with a sharp disconnection line, top left long and swept back",
  },
  {
    name: "Pompadour",
    prompt:
      "a pompadour: generous volume on top swept up and back away from the forehead with a smooth glossy finish, sides tapered short",
  },
  {
    name: "Quiff",
    prompt:
      "a quiff: the front section lifted up and back with airy volume and matte texture, the rest of the top shorter, sides tapered",
  },
  {
    name: "Slick Back",
    prompt:
      "a slick back: medium-length hair on top combed straight back flat against the head with a sleek finish, sides tapered",
  },
];

async function seed(): Promise<void> {
  const config = loadConfig();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const shopRes = await client.query(
      `insert into shops (name, slug, currency, timezone)
       values ('Black Room', 'black-room', 'EUR', 'Europe/Riga')
       on conflict (slug) do update set name = excluded.name
       returning id`,
    );
    const shopId: string = shopRes.rows[0].id;

    await client.query(
      `insert into users (telegram_id, first_name, shop_id, role, status, approved_at)
       values ($1, 'Superadmin', $2, 'superadmin', 'active', now())
       on conflict (telegram_id) do update
         set role = 'superadmin', status = 'active', shop_id = excluded.shop_id`,
      [config.SUPERADMIN_TELEGRAM_ID.toString(), shopId],
    );

    for (const [i, cut] of HAIRCUTS.entries()) {
      await client.query(
        `insert into haircuts (shop_id, name_en, prompt, sort_order, is_active)
         select $1, $2, $3, $4, true
         where not exists (
           select 1 from haircuts where shop_id = $1 and name_en = $2
         )`,
        [shopId, cut.name, cut.prompt, i + 1],
      );
    }

    await client.query("commit");
    console.log(`seeded shop ${shopId}: superadmin + ${HAIRCUTS.length} haircuts`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
