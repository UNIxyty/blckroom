import type { FastifyInstance } from "fastify";
import type { preHandlerAsyncHookHandler } from "fastify";

/**
 * The one endpoint pending/suspended users can reach: their own status.
 */
export function registerMeRoutes(
  app: FastifyInstance,
  authenticate: preHandlerAsyncHookHandler,
): void {
  app.get("/api/me", { preHandler: [authenticate] }, async (req) => {
    const u = req.user;
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      first_name: u.first_name,
      username: u.username,
      shop_id: u.shop_id,
    };
  });
}
