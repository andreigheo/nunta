import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebhookHandler } from "../src/handler.mjs";

const headers = {
  "svix-id": "msg_test",
  "svix-timestamp": "1785480000",
  "svix-signature": "v1,test",
};

test("rejects an invalid signature", async () => {
  const handler = createHandler({
    verifyWebhook: () => {
      throw new Error("invalid");
    },
  });
  const result = await handler({ body: "{}", headers });
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, "invalid_signature");
});

test("forwards an allowlisted alias with a stable idempotency key", async () => {
  const calls = [];
  const handler = createHandler({
    verifyWebhook: () => received(["Sarbato <billing@sarbato.space>"]),
    forwardEmail: async (...arguments_) => {
      calls.push(arguments_);
      return { data: { id: "forwarded_1" }, error: null };
    },
  });
  const result = await handler({ body: "{}", headers });
  assert.deepEqual(result, {
    status: 200,
    body: { accepted: true, forwarded: true },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].emailId, "received_1");
  assert.equal(calls[0][0].to, "owner@example.com");
  assert.match(calls[0][1].idempotencyKey, /^sarbato-inbound\/[a-f0-9]{64}$/);
});

test("ignores addresses outside the explicit alias allowlist", async () => {
  const calls = [];
  const handler = createHandler({
    verifyWebhook: () => received(["random@sarbato.space"]),
    forwardEmail: async (...arguments_) => calls.push(arguments_),
  });
  const result = await handler({ body: "{}", headers });
  assert.deepEqual(result, {
    status: 200,
    body: { accepted: true, forwarded: false },
  });
  assert.equal(calls.length, 0);
});

test("deduplicates an already processed webhook event", async () => {
  const calls = [];
  const handler = createHandler({
    verifyWebhook: () => received(["support@sarbato.space"]),
    forwardEmail: async (...arguments_) => calls.push(arguments_),
    eventStore: {
      has: async () => true,
      mark: async () => assert.fail("must not mark a duplicate"),
    },
  });
  const result = await handler({ body: "{}", headers });
  assert.equal(result.status, 200);
  assert.equal(result.body.duplicate, true);
  assert.equal(calls.length, 0);
});

test("returns a retryable failure when Resend forwarding fails", async () => {
  const handler = createHandler({
    verifyWebhook: () => received(["legal@sarbato.space"]),
    forwardEmail: async () => ({
      data: null,
      error: { name: "rate_limit_exceeded" },
    }),
  });
  const result = await handler({ body: "{}", headers });
  assert.deepEqual(result, {
    status: 502,
    body: { accepted: false, reason: "forward_failed" },
  });
});

function createHandler(overrides = {}) {
  return createWebhookHandler({
    verifyWebhook: () => received(["billing@sarbato.space"]),
    forwardEmail: async () => ({
      data: { id: "forwarded_1" },
      error: null,
    }),
    eventStore: {
      has: async () => false,
      mark: async () => {},
    },
    allowedRecipients: new Set([
      "billing@sarbato.space",
      "legal@sarbato.space",
      "support@sarbato.space",
    ]),
    forwardTo: "owner@example.com",
    forwardFrom: "Sarbato Mail <forward@sarbato.space>",
    logger: { info() {}, error() {} },
    ...overrides,
  });
}

function received(to) {
  return {
    type: "email.received",
    data: { email_id: "received_1", to },
  };
}
