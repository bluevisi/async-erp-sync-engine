import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ErpJobPayloadSchema, enqueueErpJob } from "./queues/erpQueue.js";
import "./workers/erpWorker.js"; // start the worker in-process

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Inbound ERP order-created webhook
app.post(
  "/api/v1/webhooks/order-created",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = ErpJobPayloadSchema.parse(req.body);
      const jobId = await enqueueErpJob(payload);

      console.info(
        `[Server] Enqueued job ${jobId} for order ${payload.order_id}`
      );

      res.status(202).json({
        accepted: true,
        jobId,
        message: "Order sync job queued for processing",
      });
    } catch (err) {
      next(err);
    }
  }
);

// Validation error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  console.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.info(`[Server] Listening on http://0.0.0.0:${PORT}`);
});

export default app;
