import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import type { Storage } from "@blackroom/shared/storage";
import {
  setUserLanguage,
  listApprovers,
  listUsersByStatus,
  listBarberSessionIds,
  listSessionImagePaths,
  stripSessionImagery,
  audit,
} from "@blackroom/db";

/**
 * Profile endpoints. GET + language PATCH are reachable by pending/suspended
 * users too — the language selector shows before any status gate, and a
 * pending user's own status is the one thing they may read.
 */
export function registerMeRoutes(
  app: FastifyInstance,
  storage: Storage,
  authenticate: preHandlerAsyncHookHandler,
): void {
  app.get("/api/me", { preHandler: [authenticate] }, async (req) => {
    const u = req.user;

    // Contact for the pending/suspended "message the owner" action.
    const approvers = await listApprovers();
    const contact = approvers.find((a) => a.username)?.username ?? null;

    // Owners see the approval backlog on the home screen.
    let pendingCount: number | undefined;
    if (["owner", "superadmin"].includes(u.role) && u.status === "active") {
      const pending = await listUsersByStatus("pending");
      pendingCount = pending.filter((p) => p.role === "pending").length;
    }

    return {
      id: u.id,
      role: u.role,
      status: u.status,
      first_name: u.first_name,
      username: u.username,
      shop_id: u.shop_id,
      language: u.language,
      created_at: u.created_at,
      owner_contact: contact,
      ...(pendingCount !== undefined ? { pending_count: pendingCount } : {}),
    };
  });

  app.patch("/api/me", { preHandler: [authenticate] }, async (req, reply) => {
    const body = z.object({ language: z.enum(["en", "ru"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });
    await setUserLanguage(req.user.id, body.data.language);
    return { ok: true };
  });

  /** Mini App twin of the /delete_my_data bot command. */
  app.post("/api/me/delete-data", { preHandler: [authenticate] }, async (req) => {
    const sessionIds = await listBarberSessionIds(req.user.id);
    let removed = 0;
    for (const id of sessionIds) {
      const paths = await listSessionImagePaths(id);
      await storage.remove(paths).catch(() => {});
      await stripSessionImagery(id);
      removed += paths.length;
    }
    await audit({
      shopId: req.user.shop_id,
      actorUserId: req.user.id,
      action: "user.delete_my_data",
      meta: { sessions: sessionIds.length, images: removed },
    });
    return { sessions: sessionIds.length, images: removed };
  });
}
