import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import {
  getSession,
  getShop,
  findUserById,
  listSessionGenerations,
  allGenerationsSettled,
  setSessionStatus,
  enqueueJob,
  getPool,
} from "@blackroom/db";
import { renderGridSheet } from "@blackroom/renderer";
import { cutDisplayName, failedTileDataUri, formatDate } from "../format.js";

export interface ComposeSheetPayload {
  session_id: string;
}

/**
 * Renders the sheet once every generation has reached a terminal state.
 * Failed cuts render as an explicit FAILED tile, never a gap; fewer than
 * nine active cuts leave the remaining slots empty (stripe backdrop).
 */
export async function runComposeSheetJob(
  config: AppConfig,
  storage: Storage,
  payload: ComposeSheetPayload,
): Promise<void> {
  const session = await getSession(payload.session_id);
  if (!session || session.status === "expired") return;

  // Hard guard against ever assembling early — settle() should only enqueue
  // when true, but a retry could have re-opened a generation since.
  if (!(await allGenerationsSettled(session.id))) return;

  const shop = await getShop(session.shop_id);
  const barber = await findUserById(session.barber_id);
  if (!shop || !barber) throw new Error("session refs missing");

  const generations = await listSessionGenerations(session.id);
  const doneCount = generations.filter((g) => g.status === "done").length;

  if (doneCount === 0) {
    await setSessionStatus(session.id, "failed");
    await enqueueJob("deliver", { session_id: session.id });
    return;
  }

  const slots = await Promise.all(
    generations.slice(0, 9).map(async (g) => ({
      cut_name: cutDisplayName(g, barber.language),
      image_url:
        g.status === "done" && g.raw_image_path
          ? await storage.createSignedUrl(g.raw_image_path, 300)
          : failedTileDataUri(),
    })),
  );

  const sheetPng = await renderGridSheet({
    slots,
    barber_name: barber.first_name ?? barber.username ?? "Black Room",
    date: formatDate(session.created_at, shop.timezone),
  });

  const sheetPath = `shops/${shop.id}/sessions/${session.id}/sheet.png`;
  await storage.upload(sheetPath, sheetPng, "image/png");

  await getPool().query(
    "update sessions set sheet_image_path = $2, status = $3 where id = $1",
    [session.id, sheetPath, doneCount === generations.length ? "complete" : "partial"],
  );

  await enqueueJob("deliver", { session_id: session.id });
}
