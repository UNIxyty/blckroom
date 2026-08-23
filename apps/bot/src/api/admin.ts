import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { Api } from "grammy";
import { z } from "zod";
import type { Storage } from "@blackroom/shared/storage";
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
  name_lv: z.string().max(80).nullable().optional(),
  name_ru: z.string().max(80).nullable().optional(),
  prompt: z.string().min(1).max(2000).optional(),
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

  app.post("/api/admin/users/:id/:action", { preHandler: ownerOnly }, async (req, reply) => {
    const { id, action } = req.params as { id: string; action: string };
    const target = await findUserById(id);
    if (!target) return reply.code(404).send({ error: "not found" });
    if (target.role === "superadmin") return reply.code(403).send({ error: "forbidden" });

    const shopId = req.user.shop_id!;
    let result: unknown = null;
    let notify: string | null = null;

    switch (action) {
      case "approve":
        result = await approveUser(target.id, shopId, req.user.id);
        notify = "You've been approved. Use /new to start a client preview.";
        break;
      case "reject":
        result = await rejectUser(target.id, req.user.id);
        break;
      case "suspend":
        result = await setUserStatus(target.id, "suspended");
        notify = "Your Black Room access has been suspended.";
        break;
      case "activate":
        result = target.role === "pending" ? null : await setUserStatus(target.id, "active");
        notify = "Your Black Room access has been restored.";
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
    const haircut = await createHaircut(req.user.shop_id!, body.data);
    await audit({
      shopId: req.user.shop_id!,
      actorUserId: req.user.id,
      action: "haircut.create",
      targetType: "haircut",
      targetId: haircut.id,
    });
    return haircut;
  });

  app.patch("/api/admin/haircuts/:id", { preHandler: ownerOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await getHaircut(id);
    if (!existing || existing.shop_id !== req.user.shop_id) {
      return reply.code(404).send({ error: "not found" });
    }
    const body = haircutPatch.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });
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
