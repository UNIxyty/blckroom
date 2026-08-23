import QRCode from "qrcode";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import {
  getSession,
  getShop,
  findUserById,
  listSessionGenerations,
  setSessionStatus,
  enqueueJob,
  getPool,
} from "@blackroom/db";
import { renderGridSheet, type SheetTokens } from "@blackroom/renderer";
import { failedTileDataUri, formatDate, formatDuration, formatPrice } from "../format.js";

export interface ComposeSheetPayload {
  session_id: string;
}

/**
 * All nine generations settled → render the 3×3 sheet with a QR to the
 * short share URL (which redirects to a fresh signed, expiring Storage URL),
 * upload it, then enqueue delivery.
 */
export async function runComposeSheetJob(
  config: AppConfig,
  storage: Storage,
  payload: ComposeSheetPayload,
): Promise<void> {
  const session = await getSession(payload.session_id);
  if (!session || session.status === "expired") return;
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
      cut_name: g.name_en,
      price: formatPrice(g.price_cents, shop.currency),
      duration: formatDuration(g.duration_minutes),
      image_url:
        g.status === "done" && g.raw_image_path
          ? await storage.createSignedUrl(g.raw_image_path, 300)
          : failedTileDataUri(),
    })),
  );
  while (slots.length < 9) {
    slots.push({ cut_name: "—", price: "", duration: "", image_url: failedTileDataUri() });
  }

  const shareUrl = `${config.PUBLIC_APP_URL}/s/${session.id}`;
  const qr = await QRCode.toDataURL(shareUrl, {
    margin: 2,
    width: 400,
    color: { dark: "#F2F3F1", light: "#101312" },
  });

  const sheetPng = await renderGridSheet({
    slots: slots as SheetTokens["slots"],
    qr_image: qr,
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
