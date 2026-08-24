import { InputFile, type Api } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import sharp from "sharp";
import type { Storage } from "@blackroom/shared/storage";
import { t, resolveLang } from "@blackroom/shared/i18n";
import { getSession, listSessionGenerations, findUserById, audit } from "@blackroom/db";
import { cutDisplayName } from "../format.js";

export interface SendAlbumPayload {
  session_id: string;
  chat_id: number;
}

/**
 * §9: deliver the framed cuts as a Telegram media group so the client can
 * swipe them one at a time. Media groups take 2–10 items — chunked for any
 * cut count; a single image degrades to sendPhoto.
 */
export async function runSendAlbumJob(
  storage: Storage,
  api: Api,
  payload: SendAlbumPayload,
): Promise<void> {
  const session = await getSession(payload.session_id);
  if (!session || session.status === "expired") return;
  if (session.expires_at.getTime() < Date.now()) return;

  const barber = await findUserById(session.barber_id);
  const lang = resolveLang(barber?.language);

  const generations = (await listSessionGenerations(session.id)).filter(
    (g) => g.status === "done" && g.framed_image_path,
  );
  if (generations.length === 0) return;

  const photos: Array<{ media: InputFile; caption: string }> = [];
  for (const g of generations) {
    const png = await storage.download(g.framed_image_path!);
    const jpeg = await sharp(png).jpeg({ quality: 90 }).toBuffer();
    const name = cutDisplayName(g, barber?.language);
    photos.push({
      media: new InputFile(jpeg, `${name}.jpg`),
      caption: t(lang, "bot.album.caption", { name }),
    });
  }

  for (let i = 0; i < photos.length; i += 10) {
    const chunk = photos.slice(i, i + 10);
    if (chunk.length === 1) {
      await api.sendPhoto(payload.chat_id, chunk[0]!.media, { caption: chunk[0]!.caption });
    } else {
      const group: InputMediaPhoto[] = chunk.map((p) => ({
        type: "photo",
        media: p.media,
        caption: p.caption,
      }));
      await api.sendMediaGroup(payload.chat_id, group);
    }
  }

  await audit({
    shopId: session.shop_id,
    action: "session.album_sent",
    targetType: "session",
    targetId: session.id,
    meta: { photos: photos.length },
  });
}
