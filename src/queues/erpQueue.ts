import { Queue } from "bullmq";
import { z } from "zod";
import redisConnection from "../config/redis.js";

export const ERP_QUEUE_NAME = "erp-sync-queue";

// Payload schema — validated at the HTTP boundary before enqueueing
export const ErpJobPayloadSchema = z.object({
  order_id: z.string().min(1, "order_id is required"),
  customer_ref: z.string().min(1, "customer_ref is required"),
  amount: z.number().positive("amount must be a positive number"),
  currency: z.string().length(3, "currency must be a 3-letter ISO 4217 code"),
});

export type ErpJobPayload = z.infer<typeof ErpJobPayloadSchema>;

export const erpQueue = new Queue<ErpJobPayload>(ERP_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s → 2s → 4s → 8s → 16s
    },
    removeOnComplete: {
      count: 500,
      age: 60 * 60 * 24, // keep completed jobs for 24 h
    },
    removeOnFail: false, // retain failed jobs in the dead-letter set for inspection
  },
});

export async function enqueueErpJob(payload: ErpJobPayload): Promise<string> {
  const job = await erpQueue.add("order-sync", payload, {
    jobId: `order-${payload.order_id}-${Date.now()}`,
  });
  return job.id ?? "";
}
