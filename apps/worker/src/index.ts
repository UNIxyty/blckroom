import Fastify from "fastify";
import { Api } from "grammy";
import { loadConfig } from "@blackroom/shared/config";
import { createStorage } from "@blackroom/shared/storage";
import { closeBrowser } from "@blackroom/renderer";
import { startQueue } from "./queue.js";
import { runRetentionSweep } from "./jobs/retention.js";

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
  extraHandlers: {
    retention_sweep: async () => {
      await runRetentionSweep(storage);
    },
  },
});

// Retention cron: sweep expired sessions every 10 minutes (and once at boot).
const RETENTION_INTERVAL_MS = 10 * 60 * 1000;
const sweep = () =>
  runRetentionSweep(storage)
    .then((n) => {
      if (n > 0) app.log.info({ sessions: n }, "retention sweep purged sessions");
    })
    .catch((err) => app.log.error({ err }, "retention sweep failed"));
const retentionTimer = setInterval(sweep, RETENTION_INTERVAL_MS);
void sweep();

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
    clearInterval(retentionTimer);
    void closeBrowser().finally(() => process.exit(0));
  });
}
