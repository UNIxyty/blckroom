import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import {
  createSession,
  getSession,
  setSessionSource,
  setSessionStatus,
  listBarberSessions,
  countBarberSessionsToday,
  listSessionGenerations,
  getShop,
  monthlyUsage,
  audit,
} from "@blackroom/db";
import { requireRole } from "./auth.js";
import { validatePortraitPhoto } from "../lib/validatePhoto.js";
import { normalizePhoto } from "../lib/normalizePhoto.js";
import { MAX_UPLOAD_MB } from "@blackroom/shared";

/** Hard cap: sessions per barber per day. */
export const SESSIONS_PER_BARBER_PER_DAY = 20;

const VALIDATION_MESSAGES: Record<string, string> = {
  too_small: "Photo is too small — need at least 800×800. Move closer or use the main camera.",
  not_an_image: "That file couldn't be read as a photo.",
  no_face: "No face found in the photo. Line the client up with the guide.",
  face_off_center: "The face isn't centred. Line the client up with the guide and retake.",
  face_too_small: "The face is too far away. Move closer so the head fills the guide.",
};

export function registerSessionRoutes(
  app: FastifyInstance,
  config: AppConfig,
  storage: Storage,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const barberUp = [authenticate, requireRole("barber", "owner", "superadmin")];

  /**
   * Consent + session creation. Enforces caps *before* anything is enqueued
   * or captured, with explicit messages rather than silent failure.
   */
  app.post("/api/sessions", { preHandler: barberUp }, async (req, reply) => {
    const body = z.object({ consent: z.literal(true) }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Consent is required before capture." });
    }

    const user = req.user;
    const shop = await getShop(user.shop_id!);
    if (!shop) return reply.code(500).send({ error: "shop missing" });

    const todayCount = await countBarberSessionsToday(user.id, shop.timezone);
    if (todayCount >= SESSIONS_PER_BARBER_PER_DAY) {
      return reply.code(429).send({
        error: `Daily limit reached (${SESSIONS_PER_BARBER_PER_DAY} sessions). Try again tomorrow.`,
      });
    }
    const usage = await monthlyUsage(shop.id);
    if (usage.spend_cents >= shop.monthly_budget_cents) {
      return reply.code(429).send({
        error: "The shop's monthly generation budget is used up. Ask the owner to raise it.",
      });
    }

    const session = await createSession({
      shopId: shop.id,
      barberId: user.id,
      retentionHours: shop.retention_hours || config.DEFAULT_RETENTION_HOURS,
    });

    const sourcePath = `shops/${shop.id}/sessions/${session.id}/source.jpg`;
    const upload = await storage.createSignedUploadUrl(sourcePath);

    return {
      session_id: session.id,
      upload_url: upload.url,
      source_path: sourcePath,
      expires_at: session.expires_at,
    };
  });

  /**
   * Called after the client PUT the capture to the signed URL.
   * Validates the upload server-side before any generation happens.
   */
  app.post("/api/sessions/:id/uploaded", { preHandler: barberUp }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session || session.barber_id !== req.user.id) {
      return reply.code(404).send({ error: "not found" });
    }
    if (session.status !== "consented") {
      return reply.code(409).send({ error: "session already processed" });
    }

    const sourcePath = `shops/${session.shop_id}/sessions/${session.id}/source.jpg`;
    let uploaded: Buffer;
    try {
      uploaded = await storage.download(sourcePath);
    } catch {
      return reply.code(400).send({ error: "Upload not found — try again." });
    }

    // §11: cap size, convert HEIC, honour EXIF orientation then strip it.
    const normalized = await normalizePhoto(uploaded);
    if (!normalized.ok) {
      await storage.remove([sourcePath]).catch(() => {});
      return reply.code(422).send({
        error:
          normalized.reason === "too_big"
            ? `File is over ${MAX_UPLOAD_MB} MB.`
            : VALIDATION_MESSAGES["not_an_image"],
        reason: normalized.reason === "too_big" ? "too_big" : "not_an_image",
      });
    }
    const photo = normalized.buffer;
    // Persist the normalized JPEG — everything downstream reads this path.
    await storage.upload(sourcePath, photo, "image/jpeg");

    const validation = await validatePortraitPhoto(photo);
    if (!validation.ok) {
      // Reject early: delete the object so nothing lingers, keep the session
      // reusable for a retake.
      await storage.remove([sourcePath]).catch(() => {});
      return reply.code(422).send({
        error: VALIDATION_MESSAGES[validation.reason ?? ""] ?? "Photo rejected.",
        reason: validation.reason,
      });
    }

    await setSessionSource(session.id, sourcePath);
    await audit({
      shopId: session.shop_id,
      actorUserId: req.user.id,
      action: "session.uploaded",
      targetType: "session",
      targetId: session.id,
      meta: { width: validation.width, height: validation.height },
    });

    return { ok: true };
  });

  /** Session status + generations (polled by the generating screen). */
  app.get("/api/sessions/:id", { preHandler: barberUp }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session || (session.barber_id !== req.user.id && req.user.role === "barber")) {
      return reply.code(404).send({ error: "not found" });
    }
    return serializeSession(session, storage, { withGenerations: true });
  });

  /** Own history, default last 7 days. */
  app.get("/api/sessions", { preHandler: barberUp }, async (req) => {
    const days = Math.min(Number((req.query as { days?: string }).days ?? 7) || 7, 30);
    const sessions = await listBarberSessions(req.user.id, days);
    return Promise.all(sessions.map((s) => serializeSession(s, storage)));
  });

  // Owner purge lives in admin routes; abort endpoint keeps retakes cheap.
  app.post("/api/sessions/:id/abort", { preHandler: barberUp }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session || session.barber_id !== req.user.id) {
      return reply.code(404).send({ error: "not found" });
    }
    if (session.status === "consented" || session.status === "uploaded") {
      await setSessionStatus(session.id, "failed");
    }
    return { ok: true };
  });
}

export async function serializeSession(
  session: {
    id: string;
    status: string;
    created_at: Date;
    expires_at: Date;
    sheet_image_path: string | null;
    cost_cents: number;
  },
  storage: Storage,
  options: { withGenerations?: boolean } = {},
): Promise<Record<string, unknown>> {
  const expired = session.expires_at.getTime() < Date.now();
  const sheetUrl =
    session.sheet_image_path && !expired
      ? await storage
          .createSignedUrl(
            session.sheet_image_path,
            Math.max(60, Math.floor((session.expires_at.getTime() - Date.now()) / 1000)),
          )
          .catch(() => null)
      : null;

  const rows = await listSessionGenerations(session.id);
  let generations: unknown[] | undefined;
  if (options.withGenerations) {
    generations = await Promise.all(
      rows.map(async (g) => ({
        id: g.id,
        haircut_name: g.name_en,
        status: g.status,
        framed_url:
          g.framed_image_path && !expired
            ? await storage.createSignedUrl(g.framed_image_path, 600).catch(() => null)
            : null,
      })),
    );
  }

  return {
    id: session.id,
    status: session.status,
    created_at: session.created_at,
    expires_at: session.expires_at,
    sheet_url: sheetUrl,
    cost_cents: session.cost_cents,
    generation_count: rows.length,
    ...(generations ? { generations } : {}),
  };
}
