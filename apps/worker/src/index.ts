import Fastify from "fastify";
import { loadConfig } from "@blackroom/shared/config";

const config = loadConfig();

// Health endpoint so Compose/Cloudflare can probe the worker.
const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "worker",
  model: config.GEMINI_IMAGE_MODEL,
  time: new Date().toISOString(),
}));

// Job polling loop lands in a later commit.

const port = Number(process.env.PORT ?? 3001);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`worker listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
