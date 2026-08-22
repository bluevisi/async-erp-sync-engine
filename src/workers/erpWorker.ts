import "dotenv/config";
import { Worker, Job, UnrecoverableError } from "bullmq";
import pRetry, { AbortError } from "p-retry";
import redisConnection from "../config/redis.js";
import { ERP_QUEUE_NAME, type ErpJobPayload } from "../queues/erpQueue.js";

const ERP_CONCURRENCY = parseInt(process.env.ERP_WORKER_CONCURRENCY ?? "5", 10);

// Simulates a rate-limited, occasionally-failing ERP API call (Odoo / SAP)
async function syncWithErpApi(payload: ErpJobPayload, attemptNumber: number): Promise<void> {
  console.info(`[ERP Worker] Syncing order ${payload.order_id} — attempt ${attemptNumber}`);

  // Simulate network latency (50–300 ms)
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 250));

  // Simulate a 30 % transient failure rate to demonstrate retry logic
  if (Math.random() < 0.3) {
    throw new Error(`Transient ERP API error for order ${payload.order_id}`);
  }

  // Simulate a permanent validation rejection from the ERP system
  if (payload.amount > 999_999) {
    throw new AbortError(
      `ERP rejected order ${payload.order_id}: amount ${payload.amount} exceeds system limit`
    );
  }

  console.info(
    `[ERP Worker] Order ${payload.order_id} synced successfully (${payload.currency} ${payload.amount})`
  );
}

async function processErpJob(job: Job<ErpJobPayload>): Promise<void> {
  const { data } = job;

  try {
    await pRetry(
      async (attemptNumber) => {
        await syncWithErpApi(data, attemptNumber);
      },
      {
        retries: 4, // BullMQ handles the outer retry; p-retry adds inner sub-attempt safety
        minTimeout: 500,
        maxTimeout: 8_000,
        factor: 2,
        onFailedAttempt(error) {
          console.warn(
            `[ERP Worker] Attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber} failed for order ${data.order_id}: ${error.message}`
          );
        },
      }
    );
  } catch (err) {
    if (err instanceof AbortError) {
      // Non-retryable — mark as unrecoverable so BullMQ moves it to the failed set immediately
      throw new UnrecoverableError((err as Error).message);
    }
    throw err; // re-throw for BullMQ exponential backoff
  }
}

export const erpWorker = new Worker<ErpJobPayload>(ERP_QUEUE_NAME, processErpJob, {
  connection: redisConnection,
  concurrency: ERP_CONCURRENCY,
  limiter: {
    max: 20,       // max 20 jobs
    duration: 1000, // per second — global rate limit against the ERP API
  },
});

erpWorker.on("completed", (job) => {
  console.info(`[ERP Worker] Job ${job.id} completed for order ${job.data.order_id}`);
});

erpWorker.on("failed", (job, err) => {
  console.error(`[ERP Worker] Job ${job?.id} failed for order ${job?.data?.order_id}: ${err.message}`);
});

erpWorker.on("error", (err) => {
  console.error("[ERP Worker] Worker error:", err.message);
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.info("[ERP Worker] Shutting down gracefully…");
  await erpWorker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.info(`[ERP Worker] Started — concurrency: ${ERP_CONCURRENCY}, queue: ${ERP_QUEUE_NAME}`);
