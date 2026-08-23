import type { Storage } from "@blackroom/shared/storage";
import {
  listExpiredSessionsWithImagery,
  listSessionImagePaths,
  stripSessionImagery,
  audit,
} from "@blackroom/db";

let sweeping = false;

/**
 * GDPR retention: delete every Storage object belonging to expired sessions
 * and null the paths. The session row survives for stats with no imagery.
 * Runs on an interval — deletion is a cron job, not a promise.
 */
export async function runRetentionSweep(storage: Storage): Promise<number> {
  if (sweeping) return 0;
  sweeping = true;
  try {
    let total = 0;
    // Loop until no expired sessions remain (batches of 50).
    for (;;) {
      const sessions = await listExpiredSessionsWithImagery(50);
      if (sessions.length === 0) break;
      for (const session of sessions) {
        const paths = await listSessionImagePaths(session.id);
        await storage.remove(paths).catch((err) => {
          console.error(`retention: failed removing objects for ${session.id}:`, err);
        });
        await stripSessionImagery(session.id);
        await audit({
          shopId: session.shop_id,
          action: "session.expire",
          targetType: "session",
          targetId: session.id,
          meta: { removed: paths.length },
        });
        total++;
      }
    }
    return total;
  } finally {
    sweeping = false;
  }
}
