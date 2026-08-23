import Fastify from "fastify";
import { loadConfig } from "@blackroom/shared/config";

const config = loadConfig();

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "bot",
  time: new Date().toISOString(),
}));

// Webhook + API routes land in later commits.

const port = Number(process.env.PORT ?? 3000);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`bot listening on :${port} (${config.PUBLIC_APP_URL})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
