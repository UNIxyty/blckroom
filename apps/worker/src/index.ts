import Fastify from "fastify";
import { Api } from "grammy";
import { loadConfig } from "@blackroom/shared/config";
import { createStorage } from "@blackroom/shared/storage";
import { closeBrowser } from "@blackroom/renderer";
import { startQueue } from "./queue.js";

const config = loadConfig();
const storage = createStorage(config);
const api = new Api(config.TELEGRAM_BOT_TOKEN);

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "worker",
  model: config.GEMINI_IMAGE_MODEL,
  time: new Date().toISOString(),
}));

const stopQueue = startQueue({
  config,
  storage,
  api,
  onJob: (job, outcome, error) => {
    if (outcome === "done") app.log.info({ job: job.type, id: job.id }, "job done");
    else app.log.warn({ job: job.type, id: job.id, outcome, error }, "job failed");
  },
});

const port = Number(process.env.PORT ?? 3001);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`worker listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopQueue();
    void closeBrowser().finally(() => process.exit(0));
  });
}
