import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppConfig } from "@blackroom/shared/config";
import type { Role } from "@blackroom/shared";
import { findUserById, upsertPendingUser, type UserRow } from "@blackroom/db";
import { validateInitData } from "../lib/initData.js";
import { signSessionJwt, verifySessionJwt } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user: UserRow;
  }
}

const authBody = z.object({ initData: z.string().min(1).max(8192) });

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig): void {
  /**
   * Exchange Telegram initData for a short-lived session JWT.
   * The only unauthenticated endpoint besides /health.
   */
  app.post("/api/auth", async (req, reply) => {
    const body = authBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad request" });

    const validated = validateInitData(body.data.initData, config.TELEGRAM_BOT_TOKEN);
    if (!validated) return reply.code(401).send({ error: "invalid initData" });

    // A user opening the Mini App before /start still gets a pending row.
    const { user } = await upsertPendingUser(
      validated.user.id,
      validated.user.username ?? null,
      validated.user.first_name ?? null,
    );

    const token = await signSessionJwt(
      { sub: user.id, tg: user.telegram_id },
      config.JWT_SECRET,
    );
    return {
      token,
      user: { id: user.id, role: user.role, status: user.status, first_name: user.first_name },
    };
  });
}

/**
 * preHandler that resolves Bearer JWT → fresh user row (role/status changes
 * apply immediately, not at token expiry).
 */
export function makeAuthenticate(config: AppConfig) {
  return async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return reply.code(401).send({ error: "unauthenticated" });

    const claims = await verifySessionJwt(token, config.JWT_SECRET);
    if (!claims) return reply.code(401).send({ error: "unauthenticated" });

    const user = await findUserById(claims.sub);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    req.user = user;
  };
}

/**
 * Deny-by-default role guard. `pending`/`suspended` users pass no guard —
 * their single reachable endpoint (/api/me) uses authenticate alone.
 */
export function requireRole(...roles: Role[]) {
  return async function guard(req: FastifyRequest, reply: FastifyReply) {
    const u = req.user;
    if (!u || u.status !== "active" || !roles.includes(u.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };
}
