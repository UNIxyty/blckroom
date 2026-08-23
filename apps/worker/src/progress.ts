import type { Api } from "grammy";
import { countDoneGenerations, getSession } from "@blackroom/db";

const EDIT_INTERVAL_MS = 2000;
const lastEdit = new Map<string, { at: number; text: string }>();

/**
 * Throttled "Generating… n/9" edits — at most one editMessageText per session
 * every 2 seconds, and never a duplicate text (Telegram 400s on those).
 */
export async function updateProgress(api: Api, sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session?.tg_chat_id || !session.tg_progress_message_id) return;

  const now = Date.now();
  const done = await countDoneGenerations(sessionId);
  const text = `Generating… ${done}/9`;

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
