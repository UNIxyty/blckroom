import Fastify from "fastify";
import { webhookCallback } from "grammy";
import { loadConfig } from "@blackroom/shared/config";
import { createBot } from "./bot.js";
import { createStorage } from "@blackroom/shared/storage";
import { registerAuthRoutes, makeAuthenticate } from "./api/auth.js";
import { registerMeRoutes } from "./api/me.js";
import { registerSessionRoutes } from "./api/sessions.js";

const config = loadConfig();

const app = Fastify({ logger: true });
const bot = createBot(config);
const authenticate = makeAuthenticate(config);
const storage = createStorage(config);

registerAuthRoutes(app, config);
registerMeRoutes(app, authenticate);
registerSessionRoutes(app, config, storage, authenticate);

app.get("/health", async () => ({
  ok: true,
  service: "bot",
  time: new Date().toISOString(),
}));

// grammY verifies X-Telegram-Bot-Api-Secret-Token against secretToken and
// answers 401 before any update parsing. Handlers only write to the DB and
// enqueue jobs, so the webhook returns 200 fast — heavy work lives in the worker.
app.post(
  "/webhook",
  webhookCallback(bot, "fastify", { secretToken: config.TELEGRAM_WEBHOOK_SECRET }),
);

const port = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  await bot.init();
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`bot @${bot.botInfo.username} listening on :${port}`);

  // Point Telegram at us on every boot — idempotent, and keeps the webhook
  // secret in sync with the env.
  const webhookUrl = `${config.PUBLIC_APP_URL}/webhook`;
  try {
    await bot.api.setWebhook(webhookUrl, {
      secret_token: config.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    app.log.info(`webhook set to ${webhookUrl}`);
  } catch (err) {
    // Boot anyway (PUBLIC_APP_URL may not resolve yet during first deploy).
    app.log.error({ err }, `setWebhook failed for ${webhookUrl}`);
  }
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
