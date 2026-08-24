import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { Api } from "grammy";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import { t, resolveLang } from "@blackroom/shared/i18n";
import {
  getSession,
  setSessionStatus,
  setSessionDelivery,
  listActiveHaircuts,
  createGenerations,
  getGenerationWithCut,
  resetGeneration,
  hasActiveGenerateJob,
  getShop,
  monthlyUsage,
  enqueueJob,
  audit,
} from "@blackroom/db";
import { requireRole } from "./auth.js";

export function registerGenerateRoutes(
  app: FastifyInstance,
  config: AppConfig,
  storage: Storage,
  api: Api,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const barberUp = [authenticate, requireRole("barber", "owner", "superadmin")];

  /**
   * Fan out: one generate job per active haircut. Fast — DB writes and one
   * sendMessage; the heavy lifting is the worker's.
   */
  app.post("/api/sessions/:id/generate", { preHandler: barberUp }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session || session.barber_id !== req.user.id) {
      return reply.code(404).send({ error: "not found" });
    }
    if (session.status !== "uploaded") {
      return reply.code(409).send({ error: `session is ${session.status}` });
    }

    const haircuts = await listActiveHaircuts(session.shop_id);
    if (haircuts.length === 0) {
      return reply.code(409).send({ error: "No active haircuts in the catalog." });
    }

    const generations = await createGenerations(
      session.id,
      haircuts.map((h) => h.id),
    );
    await setSessionStatus(session.id, "generating");

    // Progress message in the barber's chat; the worker edits and finally
    // replaces it with the sheet.
    try {
      const msg = await api.sendMessage(
        Number(req.user.telegram_id),
        t(resolveLang(req.user.language), "bot.progress", { n: 0, total: generations.length }),
      );
      await setSessionDelivery(session.id, msg.chat.id, msg.message_id);
    } catch {
      // Barber blocked the bot? Generation still proceeds; results stay in the app.
    }

    for (const generation of generations) {
      await enqueueJob("generate", {
        generation_id: generation.id,
        session_id: session.id,
      });
    }

    await audit({
      shopId: session.shop_id,
      actorUserId: req.user.id,
      action: "session.generate",
      targetType: "session",
      targetId: session.id,
      meta: { haircuts: generations.length },
    });

    return { ok: true, count: generations.length };
  });

  /**
   * §4: per-tile retry. Resets a failed generation and enqueues a fresh
   * generate job; if the sheet was already composed, the settle path
   * re-composes and re-delivers it once the retry lands.
   */
  app.post("/api/generations/:id/retry", { preHandler: barberUp }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const generation = await getGenerationWithCut(id);
    if (!generation) return reply.code(404).send({ error: "not found" });

    const session = await getSession(generation.session_id);
    if (!session || (session.barber_id !== req.user.id && req.user.role === "barber")) {
      return reply.code(404).send({ error: "not found" });
    }
    if (session.expires_at.getTime() < Date.now() || session.status === "expired") {
      return reply.code(410).send({ error: "session expired" });
    }
    if (generation.status !== "failed") {
      return reply.code(409).send({ error: `generation is ${generation.status}` });
    }
    if (await hasActiveGenerateJob(generation.id)) {
      return { ok: true, already: true };
    }

    // A retry spends money — the monthly budget still applies.
    const shop = await getShop(session.shop_id);
    if (shop) {
      const usage = await monthlyUsage(shop.id);
      if (usage.spend_cents >= shop.monthly_budget_cents) {
        return reply.code(429).send({
          error: "The shop's monthly generation budget is used up.",
        });
      }
    }

    const reset = await resetGeneration(generation.id);
    if (!reset) return reply.code(409).send({ error: "already retried" });
    await setSessionStatus(session.id, "generating");
    await enqueueJob("generate", {
      generation_id: generation.id,
      session_id: session.id,
    });
    await audit({
      shopId: session.shop_id,
      actorUserId: req.user.id,
      action: "generation.retry",
      targetType: "generation",
      targetId: generation.id,
    });
    return { ok: true };
  });

  /**
   * Short share URL (QR target): redirects to a fresh signed Storage URL.
   * Public by design — the capability is the unguessable session UUID — and
   * hard-expires with the session.
   */
  app.get("/s/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.code(404).send("not found");
    const session = await getSession(id);
    if (!session?.sheet_image_path || session.expires_at.getTime() < Date.now()) {
      return reply.code(410).type("text/html").send(
        "<html><body style='background:#0B0D0C;color:#A8AEAB;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>This preview has expired.</body></html>",
      );
    }
    const url = await storage.createSignedUrl(session.sheet_image_path, 300);
    return reply.redirect(url, 302);
  });
}
