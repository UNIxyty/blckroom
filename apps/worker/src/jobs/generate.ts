import type { Api } from "grammy";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import { buildGenerationPrompt } from "@blackroom/shared";
import { costForModelCents } from "@blackroom/shared/costs";
import {
  getGenerationWithCut,
  getSession,
  getShop,
  findUserById,
  markGenerationRunning,
  markGenerationDone,
  markGenerationFailed,
  allGenerationsSettled,
  enqueueComposeSheetOnce,
} from "@blackroom/db";
import { renderSingleCutCard } from "@blackroom/renderer";
import { generateHaircutImage } from "../gemini.js";
import { updateProgress } from "../progress.js";
import { cutDisplayName, formatDate } from "../format.js";

export interface GeneratePayload {
  generation_id: string;
  session_id: string;
}

/**
 * One haircut for one session: Gemini edit → upload raw → composite the
 * framed card → upload framed → progress edit. A permanent failure marks the
 * generation failed (error tile) without failing the session.
 */
export async function runGenerateJob(
  config: AppConfig,
  storage: Storage,
  api: Api,
  payload: GeneratePayload,
): Promise<void> {
  const generation = await getGenerationWithCut(payload.generation_id);
  if (!generation || generation.status === "done") return;

  const session = await getSession(generation.session_id);
  if (!session?.source_image_path || ["expired", "failed"].includes(session.status)) return;
  const shop = await getShop(session.shop_id);
  const barber = await findUserById(session.barber_id);
  if (!shop || !barber) throw new Error("session refs missing");

  await markGenerationRunning(generation.id);

  const source = await storage.download(session.source_image_path);
  const prompt = buildGenerationPrompt(generation.prompt);

  let image: Awaited<ReturnType<typeof generateHaircutImage>>;
  try {
    image = await generateHaircutImage(config, source, "image/jpeg", prompt);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("gemini transient")) {
      throw err; // let the job queue retry with backoff
    }
    await markGenerationFailed(generation.id, String(err instanceof Error ? err.message : err));
    await settle(api, generation.session_id);
    return;
  }

  const base = `shops/${session.shop_id}/sessions/${session.id}`;
  const ext = image.mimeType === "image/jpeg" ? "jpg" : "png";
  const rawPath = `${base}/raw/${generation.haircut_id}.${ext}`;
  await storage.upload(rawPath, image.data, image.mimeType);

  // Composite the branded frame around the raw image.
  const rawUrl = await storage.createSignedUrl(rawPath, 120);
  const framedPng = await renderSingleCutCard({
    cut_name: cutDisplayName(generation, barber.language),
    barber_name: barber.first_name ?? barber.username ?? "Black Room",
    date: formatDate(session.created_at, shop.timezone),
    image_url: rawUrl,
  });
  const framedPath = `${base}/framed/${generation.haircut_id}.png`;
  await storage.upload(framedPath, framedPng, "image/png");

  await markGenerationDone(
    generation.id,
    rawPath,
    framedPath,
    costForModelCents(config.GEMINI_IMAGE_MODEL),
  );

  await updateProgress(api, generation.session_id);
  await settle(api, generation.session_id);
}

/** Called by the generation that settles last (done or failed). */
export async function settle(api: Api, sessionId: string): Promise<void> {
  if (await allGenerationsSettled(sessionId)) {
    await enqueueComposeSheetOnce(sessionId);
  }
}
