import { ErpJobPayloadSchema, type ErpJobPayload } from "../src/queues/erpQueue";

// ---------------------------------------------------------------------------
// Payload schema validation tests
// ---------------------------------------------------------------------------
describe("ErpJobPayloadSchema", () => {
  const validPayload: ErpJobPayload = {
    order_id: "ORD-001",
    customer_ref: "CUST-42",
    amount: 250.0,
    currency: "USD",
  };

  it("accepts a fully valid payload", () => {
    const result = ErpJobPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects a missing order_id", () => {
    const result = ErpJobPayloadSchema.safeParse({
      ...validPayload,
      order_id: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.order_id).toBeDefined();
    }
  });

  it("rejects a non-positive amount", () => {
    const result = ErpJobPayloadSchema.safeParse({
      ...validPayload,
      amount: -10,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.amount).toBeDefined();
    }
  });

  it("rejects an amount of zero", () => {
    const result = ErpJobPayloadSchema.safeParse({ ...validPayload, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a currency code that is not 3 characters", () => {
    const result = ErpJobPayloadSchema.safeParse({
      ...validPayload,
      currency: "US",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.currency).toBeDefined();
    }
  });

  it("rejects a missing customer_ref", () => {
    const result = ErpJobPayloadSchema.safeParse({
      ...validPayload,
      customer_ref: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a large valid amount", () => {
    const result = ErpJobPayloadSchema.safeParse({
      ...validPayload,
      amount: 500_000,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enqueueing behaviour (mocked — no live Redis required in CI)
// ---------------------------------------------------------------------------
jest.mock("../src/queues/erpQueue", () => {
  const original = jest.requireActual("../src/queues/erpQueue");
  return {
    ...original,
    enqueueErpJob: jest.fn().mockResolvedValue("mock-job-id-123"),
  };
});

describe("enqueueErpJob", () => {
  it("returns a job id when called with a valid payload", async () => {
    const { enqueueErpJob } = await import("../src/queues/erpQueue");
    const jobId = await enqueueErpJob({
      order_id: "ORD-999",
      customer_ref: "CUST-77",
      amount: 99.99,
      currency: "EUR",
    });
    expect(typeof jobId).toBe("string");
    expect(jobId.length).toBeGreaterThan(0);
  });

  it("is called with the exact payload passed in", async () => {
    const { enqueueErpJob } = await import("../src/queues/erpQueue");
    const payload: ErpJobPayload = {
      order_id: "ORD-777",
      customer_ref: "CUST-12",
      amount: 1500,
      currency: "GBP",
    };
    await enqueueErpJob(payload);
    expect(enqueueErpJob).toHaveBeenCalledWith(payload);
  });
});
