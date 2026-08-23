# async-erp-sync-engine

> **Author:** Usman Khan ([@bluevisi](https://github.com/bluevisi)) | **Vendor:** Zentiq Labs  
> **Primary Tech Stack:** Node.js, TypeScript, BullMQ, Redis, Docker, Express, Zod  
> **Domain:** Distributed Systems, Asynchronous Message Processing, Webhook Ingestion, ERP Integration  

A production-ready asynchronous ERP synchronisation microservice built with **Node.js**, **TypeScript**, **BullMQ**, and **Redis**. Inbound order webhooks are accepted instantly over HTTP and processed durably in the background with full exponential-backoff retry logic and dead-letter queue support.
---

## Architecture Overview

```
                         ┌──────────────────────────────────┐
  ERP / Shopify          │         Express HTTP Server        │
  Webhook POST ─────────▶│  POST /api/v1/webhooks/order-      │
  (order-created)        │         created                    │
                         │                                    │
                         │  1. Zod payload validation         │
                         │  2. enqueueErpJob() → BullMQ       │
                         │  3. HTTP 202 Accepted returned     │
                         └──────────────┬───────────────────┘
                                        │ enqueue
                                        ▼
                         ┌──────────────────────────────────┐
                         │      Redis 7 (BullMQ backend)     │
                         │                                   │
                         │  ┌─────────────────────────────┐ │
                         │  │  erp-sync-queue (active)    │ │
                         │  └──────────┬──────────────────┘ │
                         │             │                     │
                         │  ┌──────────▼──────────────────┐ │
                         │  │  failed set (dead-letter)   │ │
                         │  └─────────────────────────────┘ │
                         └──────────────┬───────────────────┘
                                        │ dequeue
                                        ▼
                         ┌──────────────────────────────────┐
                         │         ERP Worker (BullMQ)       │
                         │                                   │
                         │  • Concurrency: 5 (configurable) │
                         │  • Rate limit: 20 jobs / second  │
                         │  • Retry: 5 attempts, exponential│
                         │    backoff (1 s → 2 s → 4 s …)  │
                         │  • Permanent failures → failed   │
                         │    set (UnrecoverableError)       │
                         └──────────────┬───────────────────┘
                                        │ sync
                                        ▼
                         ┌──────────────────────────────────┐
                         │    Odoo / SAP ERP API (external)  │
                         └──────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Fire-and-Forget HTTP Endpoint → HTTP 202
The webhook handler validates the payload with **Zod** and immediately enqueues the job onto Redis, returning `202 Accepted` in well under 10 ms. The caller is never blocked by downstream ERP latency or failures.

### 2. BullMQ for Durable Queuing
[BullMQ](https://docs.bullmq.io/) provides:
- **Atomic job state transitions** backed by Lua scripts in Redis.
- **Persistent job storage** — jobs survive worker restarts.
- **Built-in delayed retries** with exponential backoff.
- **Rate limiting** at the worker level to protect the ERP API from thundering herds.

### 3. Exponential Backoff Retries (5 Attempts)
Each job is attempted up to **5 times** with exponential backoff:

| Attempt | Delay   |
|---------|---------|
| 1       | 1 s     |
| 2       | 2 s     |
| 3       | 4 s     |
| 4       | 8 s     |
| 5       | 16 s    |

An inner `p-retry` loop adds a secondary safety net for transient network blips within a single BullMQ attempt.

### 4. Dead-Letter Queue (Failed Set)
Jobs that exhaust all retry attempts, or are immediately rejected with an `UnrecoverableError` (e.g. ERP validation rejection), are moved to BullMQ's **failed set**. This acts as a dead-letter queue — failed jobs are preserved for inspection, replay, or manual intervention via the BullMQ API or a dashboard such as [Bull Board](https://github.com/felixmosh/bull-board).

### 5. Graceful Shutdown
The worker listens for `SIGTERM` / `SIGINT` and calls `worker.close()`, which waits for in-flight jobs to finish before exiting — critical for zero-downtime Kubernetes rolling updates.

---

## Project Structure

```
async-erp-sync-engine/
├── src/
│   ├── config/
│   │   └── redis.ts          # Shared ioredis connection for BullMQ
│   ├── queues/
│   │   └── erpQueue.ts       # Queue definition + Zod schema + enqueue helper
│   ├── workers/
│   │   └── erpWorker.ts      # Background worker with retry + rate-limit logic
│   └── server.ts             # Express HTTP server
├── tests/
│   └── queue.test.ts         # Jest integration tests (schema + mock enqueueing)
├── docker-compose.yml        # App + Redis services
├── Dockerfile                # Multi-stage production build
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Getting Started

### Prerequisites
- Node.js ≥ 20
- Docker & Docker Compose (for running Redis locally)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

### 3. Start Redis
```bash
docker compose up redis -d
```

### 4. Run in development mode (hot-reload)
```bash
npm run dev
```

### 5. Run tests
```bash
npm test
```

### 6. Run the full stack with Docker Compose
```bash
docker compose up --build
```

---

## API Reference

### `POST /api/v1/webhooks/order-created`

Accepts an inbound order webhook and enqueues a background ERP sync job.

**Request body**
```json
{
  "order_id":     "ORD-001",
  "customer_ref": "CUST-42",
  "amount":       250.00,
  "currency":     "USD"
}
```

**Response — 202 Accepted**
```json
{
  "accepted": true,
  "jobId": "order-ORD-001-1718000000000",
  "message": "Order sync job queued for processing"
}
```

**Response — 400 Bad Request** (schema violation)
```json
{
  "error": "Validation failed",
  "details": {
    "currency": ["currency must be a 3-letter ISO 4217 code"]
  }
}
```

### `GET /health`
Returns `{ "status": "ok", "timestamp": "…" }` — suitable for liveness probes.

---

## Environment Variables

| Variable                | Default     | Description                                    |
|-------------------------|-------------|------------------------------------------------|
| `PORT`                  | `3000`      | HTTP server port                               |
| `REDIS_HOST`            | `localhost` | Redis hostname                                 |
| `REDIS_PORT`            | `6379`      | Redis port                                     |
| `REDIS_PASSWORD`        | _(empty)_   | Redis AUTH password (optional)                 |
| `ERP_WORKER_CONCURRENCY`| `5`         | Number of jobs processed in parallel           |

---

## Monitoring & Observability

Consider adding [Bull Board](https://github.com/felixmosh/bull-board) as a read-only dashboard to inspect active, completed, and failed jobs in Redis without writing custom tooling.

---

## License

MIT
