import { InlineKeyboard, InputFile, type Api } from "grammy";
import sharp from "sharp";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import { t, resolveLang, type Lang } from "@blackroom/shared/i18n";
import {
  getSession,
  countDoneGenerations,
  listSessionGenerations,
  findUserById,
  audit,
} from "@blackroom/db";
import { clearProgress } from "../progress.js";

export interface DeliverPayload {
  session_id: string;
}

/**
 * Send the finished sheet to the barber's chat and clean up the progress
 * message. (A text message can't be edited into a photo, so: delete + send.)
 */
export async function runDeliverJob(
  config: AppConfig,
  storage: Storage,
  api: Api,
  payload: DeliverPayload,
): Promise<void> {
  const session = await getSession(payload.session_id);
  if (!session?.tg_chat_id) return;
  const chatId = Number(session.tg_chat_id);

  const barber = await findUserById(session.barber_id);
  const lang: Lang = resolveLang(barber?.language);

  clearProgress(session.id);

  if (!session.sheet_image_path) {
    await replaceProgress(api, session, t(lang, "bot.sheet.failed"));
    return;
  }

  const sheetPng = await storage.download(session.sheet_image_path);
  // Telegram photos are recompressed anyway; JPEG keeps us under the 10MB bot limit.
  const sheetJpeg = await sharp(sheetPng).jpeg({ quality: 90 }).toBuffer();

  const generations = await listSessionGenerations(session.id);
  const done = await countDoneGenerations(session.id);
  const total = generations.length;
  const shareUrl = `${config.PUBLIC_APP_URL}/s/${session.id}`;
  const keyboard = new InlineKeyboard().url(
    t(lang, "bot.send.client"),
    `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(t(lang, "bot.share.text"))}`,
  );

  await api.sendPhoto(chatId, new InputFile(sheetJpeg, "black-room-sheet.jpg"), {
    caption:
      done === total
        ? t(lang, "bot.sheet.ready")
        : t(lang, "bot.sheet.partial", { n: done, total }),
    reply_markup: keyboard,
  });

  if (session.tg_progress_message_id) {
    await api.deleteMessage(chatId, Number(session.tg_progress_message_id)).catch(() => {});
  }

  await audit({
    shopId: session.shop_id,
    action: "session.delivered",
    targetType: "session",
    targetId: session.id,
    meta: { done },
  });
}

async function replaceProgress(
  api: Api,
  session: { tg_chat_id: string | null; tg_progress_message_id: string | null },
  text: string,
): Promise<void> {
  if (!session.tg_chat_id) return;
  if (session.tg_progress_message_id) {
    const edited = await api
      .editMessageText(Number(session.tg_chat_id), Number(session.tg_progress_message_id), text)
      .then(() => true)
      .catch(() => false);
    if (edited) return;
  }
  await api.sendMessage(Number(session.tg_chat_id), text).catch(() => {});
}
