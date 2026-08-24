import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { Api } from "grammy";
import { z } from "zod";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import { t, resolveLang } from "@blackroom/shared/i18n";
import { MAX_ACTIVE_HAIRCUTS, buildGenerationPrompt } from "@blackroom/shared";
import { costForModelCents } from "@blackroom/shared/costs";
import { generateHaircutImage } from "@blackroom/shared/gemini";
import { validatePortraitPhoto } from "../lib/validatePhoto.js";
import { normalizePhoto } from "../lib/normalizePhoto.js";
import {
  countActiveHaircuts,
  haircutNameTaken,
  softDeleteHaircut,
  userStats,
  sessionsToday,
  listShopSessions,
  listAuditForTarget,
  countOtherActiveOwners,
  setUserRole,
  setShopTestImage,
  countRecentTestGenerations,
} from "@blackroom/db";
import {
  listShopUsers,
  findUserById,
  approveUser,
  rejectUser,
  setUserStatus,
  getShop,
  monthlyUsage,
  listAllHaircuts,
  getHaircut,
  createHaircut,
  updateHaircut,
  reorderHaircuts,
  getSession,
  listSessionImagePaths,
  stripSessionImagery,
  audit,
} from "@blackroom/db";
import { requireRole } from "./auth.js";

const haircutPatch = z.object({
  name_en: z.string().min(1).max(80).optional(),
  name_ru: z.string().max(80).nullable().optional(),
  prompt: z.string().min(1).max(600).optional(),
  is_active: z.boolean().optional(),
});

/** Editor test generations per shop per hour. */
const TEST_GENERATIONS_PER_HOUR = 15;

export function registerAdminRoutes(
  app: FastifyInstance,
  config: AppConfig,
  storage: Storage,
  api: Api,
  authenticate: preHandlerAsyncHookHandler,
): void {
  const ownerOnly = [authenticate, requireRole("owner", "superadmin")];

  // ---- overview (C1) -----------------------------------------------------

  app.get("/api/admin/overview", { preHandler: ownerOnly }, async (req) => {
    const shop = (await getShop(req.user.shop_id!))!;
    const [users, usage, today, cuts] = await Promise.all([
      listShopUsers(shop.id),
      monthlyUsage(shop.id),
      sessionsToday(shop.id, shop.timezone),
      listAllHaircuts(shop.id),
    ]);
    return {
      pending: users.filter((u) => u.role === "pending" && u.status === "pending").length,
      users: users.filter((u) => u.status !== "pending" || u.role !== "pending").length,
      spend_cents: usage.spend_cents,
      budget_cents: shop.monthly_budget_cents,
      currency: shop.currency,
      sessions_month: usage.sessions,
      sessions_today: today.sessions,
      barbers_today: today.barbers,
      catalog_active: cuts.filter((c) => c.is_active).length,
      catalog_total: cuts.length,
    };
  });

  // ---- users -------------------------------------------------------------

  app.get("/api/admin/users", { preHandler: ownerOnly }, async (req) => {
    const users = await listShopUsers(req.user.shop_id!);
    return users.map((u) => ({
      id: u.id,
      telegram_id: u.telegram_id,
      username: u.username,
      first_name: u.first_name,
      role: u.role,
      status: u.status,
      created_at: u.created_at,
    }));
  });

  app.get("/api/admin/users/:id", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const target = await findUserById(id);
    if (!target) return reply.code(404).send({ error: "not found" });
    const [stats, activity] = await Promise.all([userStats(id), listAuditForTarget(id)]);
    return {
      id: target.id,
      username: target.username,
      first_name: target.first_name,
      role: target.role,
      status: target.status,
      created_at: target.created_at,
      sessions: stats.sessions,
      // C10 folded in: the admin actions that touched this user.
      activity: activity.map((a) => ({
        action: a.action,
        at: a.created_at,
        by: a.actor_name ?? (a.actor_username ? `@${a.actor_username}` : null),
      })),
    };
  });

  /**
   * Role change (C3). Server-side last-owner guard: the shop must never be
   * left without an active owner-level account — regardless of what the UI
   * allows.
   */
  app.post("/api/admin/users/:id/role", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ role: z.enum(["barber", "owner"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });

    const target = await findUserById(id);
    if (!target || target.shop_id !== req.user.shop_id) {
      return reply.code(404).send({ error: "not found" });
    }
    if (target.role === "superadmin") return reply.code(403).send({ error: "forbidden" });
    if (target.role === "pending") {
      return reply.code(409).send({ error: "approve the user first" });
    }
    if (target.role === body.data.role) return { ok: true };

    if (
      target.role === "owner" &&
      body.data.role === "barber" &&
      (await countOtherActiveOwners(target.id, req.user.shop_id!)) === 0
    ) {
      return reply.code(409).send({ error: "last owner", reason: "last_owner" });
    }

    const updated = await setUserRole(target.id, body.data.role);
    if (!updated) return reply.code(409).send({ error: "not applicable" });
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: `user.role.${body.data.role}`,
      targetType: "user",
      targetId: target.id,
    });
    return { ok: true };
  });

  app.post("/api/admin/users/:id/:action", { preHandler: ownerOnly }, async (req, reply) => {
    const { id, action } = req.params as { id: string; action: string };
    const target = await findUserById(id);
    if (!target) return reply.code(404).send({ error: "not found" });
    if (target.role === "superadmin") return reply.code(403).send({ error: "forbidden" });

    const shopId = req.user.shop_id!;
    const targetLang = resolveLang(target.language);
    let result: unknown = null;
    let notify: string | null = null;

    switch (action) {
      case "approve":
        result = await approveUser(target.id, shopId, req.user.id);
        notify = t(targetLang, "bot.approved.msg");
        break;
      case "reject":
        result = await rejectUser(target.id, req.user.id);
        break;
      case "suspend":
        // Last-owner guard applies to suspension too — a suspended owner
        // can't approve anyone, which would strand the shop.
        if (
          ["owner", "superadmin"].includes(target.role) &&
          (await countOtherActiveOwners(target.id, shopId)) === 0
        ) {
          return reply.code(409).send({ error: "last owner", reason: "last_owner" });
        }
        result = await setUserStatus(target.id, "suspended");
        notify = t(targetLang, "bot.suspended.notify");
        break;
      case "activate":
        result = target.role === "pending" ? null : await setUserStatus(target.id, "active");
        notify = t(targetLang, "bot.restored.notify");
        break;
      default:
        return reply.code(400).send({ error: "unknown action" });
    }
    if (!result) return reply.code(409).send({ error: "action not applicable" });

    await audit({
      shopId,
      actorUserId: req.user.id,
      action: `user.${action}`,
      targetType: "user",
      targetId: target.id,
    });
    if (notify) {
      await api.sendMessage(Number(target.telegram_id), notify).catch(() => {});
    }
    return { ok: true };
  });

  // ---- haircut catalog ---------------------------------------------------

  app.get("/api/admin/haircuts", { preHandler: ownerOnly }, async (req) =>
    listAllHaircuts(req.user.shop_id!),
  );

  app.post("/api/admin/haircuts", { preHandler: ownerOnly }, async (req, reply) => {
    const body = haircutPatch.required({ name_en: true, prompt: true }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });
    const shopId = req.user.shop_id!;

    if (await haircutNameTaken(shopId, body.data.name_en)) {
      return reply.code(409).send({ error: "name already used", reason: "name_taken" });
    }
    // New cuts are created active — the 3×3 sheet caps active cuts at 9.
    if ((await countActiveHaircuts(shopId)) >= MAX_ACTIVE_HAIRCUTS) {
      return reply.code(409).send({
        error: `at most ${MAX_ACTIVE_HAIRCUTS} active cuts`,
        reason: "active_limit",
      });
    }

    const haircut = await createHaircut(shopId, body.data);
    await audit({
      shopId,
      actorUserId: req.user.id,
      action: "haircut.create",
      targetType: "haircut",
      targetId: haircut.id,
      meta: { name: haircut.name_en },
    });
    return haircut;
  });

  app.patch("/api/admin/haircuts/:id", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getHaircut(id);
    if (!existing || existing.shop_id !== req.user.shop_id || existing.deleted_at) {
      return reply.code(404).send({ error: "not found" });
    }
    const body = haircutPatch.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });

    if (
      body.data.name_en &&
      (await haircutNameTaken(req.user.shop_id!, body.data.name_en, id))
    ) {
      return reply.code(409).send({ error: "name already used", reason: "name_taken" });
    }
    if (
      body.data.is_active === true &&
      !existing.is_active &&
      (await countActiveHaircuts(req.user.shop_id!)) >= MAX_ACTIVE_HAIRCUTS
    ) {
      return reply.code(409).send({
        error: `at most ${MAX_ACTIVE_HAIRCUTS} active cuts`,
        reason: "active_limit",
      });
    }

    const updated = await updateHaircut(id, body.data);
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "haircut.update",
      targetType: "haircut",
      targetId: id,
      meta: body.data,
    });
    return updated;
  });

  app.delete("/api/admin/haircuts/:id", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getHaircut(id);
    if (!existing || existing.shop_id !== req.user.shop_id || existing.deleted_at) {
      return reply.code(404).send({ error: "not found" });
    }
    await softDeleteHaircut(id);
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "haircut.delete",
      targetType: "haircut",
      targetId: id,
      meta: { name: existing.name_en },
    });
    return { ok: true };
  });

  app.post("/api/admin/haircuts/reorder", { preHandler: ownerOnly }, async (req, reply) => {
    const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });
    await reorderHaircuts(req.user.shop_id!, body.data.ids);
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "haircut.reorder",
    });
    return { ok: true };
  });

  // ---- test portrait + test-before-saving (Part 2) -----------------------

  app.get("/api/admin/test-photo", { preHandler: ownerOnly }, async (req) => {
    const shop = (await getShop(req.user.shop_id!))!;
    if (!shop.test_image_path) return { exists: false };
    const url = await storage.createSignedUrl(shop.test_image_path, 600).catch(() => null);
    return { exists: !!url, url };
  });

  app.post("/api/admin/test-photo", { preHandler: ownerOnly }, async (req) => {
    const path = `shops/${req.user.shop_id}/test/portrait.jpg`;
    const upload = await storage.createSignedUploadUrl(path);
    return { upload_url: upload.url, path };
  });

  /** Same hygiene as client captures: normalize (HEIC/EXIF/size), face-check. */
  app.post("/api/admin/test-photo/confirm", { preHandler: ownerOnly }, async (req, reply) => {
    const path = `shops/${req.user.shop_id}/test/portrait.jpg`;
    let uploaded: Buffer;
    try {
      uploaded = await storage.download(path);
    } catch {
      return reply.code(400).send({ error: "upload not found" });
    }
    const normalized = await normalizePhoto(uploaded);
    if (!normalized.ok) {
      await storage.remove([path]).catch(() => {});
      return reply.code(422).send({ error: "photo rejected", reason: normalized.reason });
    }
    const validation = await validatePortraitPhoto(normalized.buffer);
    if (!validation.ok) {
      await storage.remove([path]).catch(() => {});
      return reply.code(422).send({ error: "photo rejected", reason: validation.reason });
    }
    await storage.upload(path, normalized.buffer, "image/jpeg");
    await setShopTestImage(req.user.shop_id!, path);
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "shop.test_photo",
    });
    return { ok: true };
  });

  /**
   * Run one prompt against the stored test portrait — no save, no fan-out.
   * Rate-limited per hour; the cost is audited and counts toward the cap.
   */
  app.post("/api/admin/haircuts/test", { preHandler: ownerOnly }, async (req, reply) => {
    const body = z.object({ prompt: z.string().min(1).max(600) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });

    const shop = (await getShop(req.user.shop_id!))!;
    if (!shop.test_image_path) {
      return reply.code(409).send({ error: "no test photo", reason: "no_test_photo" });
    }
    if ((await countRecentTestGenerations(shop.id)) >= TEST_GENERATIONS_PER_HOUR) {
      return reply.code(429).send({ error: "rate limited", reason: "rate_limited" });
    }
    const usage = await monthlyUsage(shop.id);
    if (usage.spend_cents >= shop.monthly_budget_cents) {
      return reply.code(429).send({ error: "spend cap reached", reason: "budget" });
    }

    const source = await storage.download(shop.test_image_path);
    let image;
    try {
      image = await generateHaircutImage(
        config,
        source,
        "image/jpeg",
        buildGenerationPrompt(body.data.prompt),
      );
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message.slice(0, 200) : "generation failed",
        reason: "generation_failed",
      });
    }

    const resultPath = `shops/${shop.id}/test/last-result.png`;
    await storage.upload(resultPath, image.data, image.mimeType);
    const cost = costForModelCents(config.GEMINI_IMAGE_MODEL);
    await audit({
      shopId: shop.id,
      actorUserId: req.user.id,
      action: "haircut.test",
      meta: { cost_cents: cost, prompt_length: body.data.prompt.length },
    });
    const url = await storage.createSignedUrl(resultPath, 600);
    return { url, cost_cents: cost };
  });

  /** Duplicate a cut as a starting point — created inactive, name uniquified. */
  app.post("/api/admin/haircuts/:id/duplicate", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getHaircut(id);
    if (!existing || existing.shop_id !== req.user.shop_id || existing.deleted_at) {
      return reply.code(404).send({ error: "not found" });
    }
    let name = `${existing.name_en} 2`;
    for (let n = 2; await haircutNameTaken(req.user.shop_id!, name); n++) {
      name = `${existing.name_en} ${n + 1}`;
      if (n > 20) return reply.code(409).send({ error: "name space exhausted" });
    }
    const copy = await createHaircut(req.user.shop_id!, {
      name_en: name,
      name_ru: existing.name_ru,
      prompt: existing.prompt,
      is_active: false,
    });
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "haircut.duplicate",
      targetType: "haircut",
      targetId: copy.id,
      meta: { from: existing.id },
    });
    return copy;
  });

  // ---- sessions (C8) -----------------------------------------------------

  app.get("/api/admin/sessions", { preHandler: ownerOnly }, async (req) => {
    const days = Math.min(Number((req.query as { days?: string }).days ?? 30) || 30, 90);
    return listShopSessions(req.user.shop_id!, days);
  });

  // ---- session purge (owner, on demand) ----------------------------------

  app.delete("/api/admin/sessions/:id", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session || session.shop_id !== req.user.shop_id) {
      return reply.code(404).send({ error: "not found" });
    }
    const paths = await listSessionImagePaths(id);
    await storage.remove(paths).catch(() => {});
    await stripSessionImagery(id);
    await audit({
      shopId: session.shop_id,
      actorUserId: req.user.id,
      action: "session.purge",
      targetType: "session",
      targetId: id,
      meta: { removed: paths.length },
    });
    return { ok: true, removed: paths.length };
  });
}
