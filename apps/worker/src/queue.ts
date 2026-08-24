import { hostname } from "node:os";
import type { Api } from "grammy";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import { claimJobs, completeJob, failJob, markGenerationFailed, type JobRow } from "@blackroom/db";
import { runGenerateJob, settle, type GeneratePayload } from "./jobs/generate.js";
import { runComposeSheetJob, type ComposeSheetPayload } from "./jobs/composeSheet.js";
import { runDeliverJob, type DeliverPayload } from "./jobs/deliver.js";
import { runSendAlbumJob, type SendAlbumPayload } from "./jobs/sendAlbum.js";

const CONCURRENCY = 9;
const POLL_INTERVAL_MS = 500;

export interface QueueDeps {
  config: AppConfig;
  storage: Storage;
  api: Api;
  onJob?: (job: JobRow, outcome: "done" | "retried" | "dead", error?: string) => void;
  extraHandlers?: Record<string, (payload: Record<string, unknown>) => Promise<void>>;
}

export function startQueue(deps: QueueDeps): () => void {
  const workerId = `${hostname()}:${process.pid}`;
  let inflight = 0;
  let stopped = false;

  async function runJob(job: JobRow): Promise<void> {
    try {
      switch (job.type) {
        case "generate":
          await runGenerateJob(deps.config, deps.storage, deps.api, job.payload as unknown as GeneratePayload);
          break;
        case "compose_sheet":
          await runComposeSheetJob(deps.config, deps.storage, job.payload as unknown as ComposeSheetPayload);
          break;
        case "deliver":
          await runDeliverJob(deps.config, deps.storage, deps.api, job.payload as unknown as DeliverPayload);
          break;
        case "send_album":
          await runSendAlbumJob(deps.storage, deps.api, job.payload as unknown as SendAlbumPayload);
          break;
        default: {
          const handler = deps.extraHandlers?.[job.type];
          if (!handler) throw new Error(`no handler for job type ${job.type}`);
          await handler(job.payload);
        }
      }
      await completeJob(job.id);
      deps.onJob?.(job, "done");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome = await failJob(job, message);
      deps.onJob?.(job, outcome, message);

      // A generate job that is fully dead becomes a failed tile, and the
      // session must still settle into a sheet.
      if (outcome === "dead" && job.type === "generate") {
        const payload = job.payload as unknown as GeneratePayload;
        await markGenerationFailed(payload.generation_id, message).catch(() => {});
        await settle(deps.api, payload.session_id).catch(() => {});
      }
    } finally {
      inflight--;
    }
  }

  async function tick(): Promise<void> {
    if (stopped || inflight >= CONCURRENCY) return;
    try {
      const jobs = await claimJobs(CONCURRENCY - inflight, workerId);
      for (const job of jobs) {
        inflight++;
        void runJob(job);
      }
    } catch (err) {
      console.error("queue poll failed:", err);
    }
  }

  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
