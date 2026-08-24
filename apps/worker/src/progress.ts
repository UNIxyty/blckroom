import type { Api } from "grammy";
import { t, resolveLang } from "@blackroom/shared/i18n";
import { countDoneGenerations, getSession, findUserById, getPool } from "@blackroom/db";

const EDIT_INTERVAL_MS = 2000;
const lastEdit = new Map<string, { at: number; text: string }>();

async function generationTotal(sessionId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    "select count(*) as n from generations where session_id = $1",
    [sessionId],
  );
  return Number(rows[0]!.n);
}

/**
 * Throttled "Generating… n/N" edits — at most one editMessageText per session
 * every 2 seconds, and never a duplicate text (Telegram 400s on those).
 */
export async function updateProgress(api: Api, sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session?.tg_chat_id || !session.tg_progress_message_id) return;

  const barber = await findUserById(session.barber_id);
  const lang = resolveLang(barber?.language);

  const now = Date.now();
  const [done, total] = await Promise.all([
    countDoneGenerations(sessionId),
    generationTotal(sessionId),
  ]);
  const text = t(lang, "bot.progress", { n: done, total });

  const prev = lastEdit.get(sessionId);
  if (prev && (now - prev.at < EDIT_INTERVAL_MS || prev.text === text)) return;
  lastEdit.set(sessionId, { at: now, text });

  await api
    .editMessageText(Number(session.tg_chat_id), Number(session.tg_progress_message_id), text)
    .catch(() => {});
}

export function clearProgress(sessionId: string): void {
  lastEdit.delete(sessionId);
}
