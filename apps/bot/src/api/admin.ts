import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { Api } from "grammy";
import { z } from "zod";
import type { Storage } from "@blackroom/shared/storage";
import { t, resolveLang } from "@blackroom/shared/i18n";
import { MAX_ACTIVE_HAIRCUTS } from "@blackroom/shared";
import {
  countActiveHaircuts,
  haircutNameTaken,
  softDeleteHaircut,
  userStats,
  sessionsToday,
  listShopSessions,
  listAudit,
  countOtherActiveOwners,
  setUserRole,
} from "@blackroom/db";
import {
  listShopUsers,
  findUserById,
  approveUser,
  rejectUser,
  setUserStatus,
  getShop,
  updateShopSettings,
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
  price_cents: z.number().int().min(0).max(1_000_000).optional(),
  duration_minutes: z.number().int().min(5).max(600).optional(),
  is_active: z.boolean().optional(),
});

export function registerAdminRoutes(
  app: FastifyInstance,
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
    const stats = await userStats(id);
    return {
      id: target.id,
      username: target.username,
      first_name: target.first_name,
      role: target.role,
      status: target.status,
      created_at: target.created_at,
      sessions: stats.sessions,
      spend_cents: stats.spend_cents,
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

  /** Reference image: signed upload URL, then PATCH sets the stored path. */
  app.post(
    "/api/admin/haircuts/:id/reference-upload",
    { preHandler: ownerOnly },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await getHaircut(id);
      if (!existing || existing.shop_id !== req.user.shop_id) {
        return reply.code(404).send({ error: "not found" });
      }
      const path = `shops/${req.user.shop_id}/refs/${id}.jpg`;
      const upload = await storage.createSignedUploadUrl(path);
      return { upload_url: upload.url, path };
    },
  );

  app.post(
    "/api/admin/haircuts/:id/reference-set",
    { preHandler: ownerOnly },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await getHaircut(id);
      if (!existing || existing.shop_id !== req.user.shop_id) {
        return reply.code(404).send({ error: "not found" });
      }
      const path = `shops/${req.user.shop_id}/refs/${id}.jpg`;
      await updateHaircut(id, { reference_image_url: path });
      return { ok: true };
    },
  );

  // ---- spend dashboard ---------------------------------------------------

  app.get("/api/admin/stats", { preHandler: ownerOnly }, async (req) => {
    const shop = (await getShop(req.user.shop_id!))!;
    const usage = await monthlyUsage(shop.id);
    return {
      sessions: usage.sessions,
      spend_cents: usage.spend_cents,
      budget_cents: shop.monthly_budget_cents,
      currency: shop.currency,
      cost_per_session_cents:
        usage.sessions > 0 ? Math.round(usage.spend_cents / usage.sessions) : 0,
    };
  });

  // ---- settings ----------------------------------------------------------

  app.get("/api/admin/shop", { preHandler: ownerOnly }, async (req) => {
    const shop = (await getShop(req.user.shop_id!))!;
    return {
      name: shop.name,
      currency: shop.currency,
      retention_hours: shop.retention_hours,
      monthly_budget_cents: shop.monthly_budget_cents,
    };
  });

  app.patch("/api/admin/shop", { preHandler: ownerOnly }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        currency: z.string().length(3).optional(),
        retention_hours: z.number().int().min(1).max(720).optional(),
        monthly_budget_cents: z.number().int().min(0).max(100_000_000).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });
    const updated = await updateShopSettings(req.user.shop_id!, body.data);
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "shop.update",
      meta: body.data,
    });
    return updated;
  });

  // ---- sessions (C8) -----------------------------------------------------

  app.get("/api/admin/sessions", { preHandler: ownerOnly }, async (req) => {
    const days = Math.min(Number((req.query as { days?: string }).days ?? 30) || 30, 90);
    return listShopSessions(req.user.shop_id!, days);
  });

  // ---- audit log (C10) ---------------------------------------------------

  app.get("/api/admin/audit", { preHandler: ownerOnly }, async (req) =>
    listAudit(req.user.shop_id!),
  );

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
