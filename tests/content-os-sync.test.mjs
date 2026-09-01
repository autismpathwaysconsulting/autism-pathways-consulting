import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as authorize } from "../functions/_middleware.js";
import { onRequestGet, onRequestPut } from "../functions/api/content-os/state.js";

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return type === "json" && value ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
}

const endpoint = "https://example.com/api/content-os/state";
const baseState = () => ({
  version: "2.1",
  calendar: {},
  results: [],
  products: {},
  book: [],
  lastBackupAt: null,
  lastBackupResultCount: 0,
  updatedAt: null,
});

function putRequest(body, extraHeaders = {}) {
  return new Request(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "X-APC-Content-OS": "1",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

test("protected routes fail closed when the secret is missing", async () => {
  const response = await authorize({
    env: {},
    request: new Request("https://example.com/content-os/"),
    next: () => new Response("private"),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("protected routes challenge invalid credentials and accept valid credentials", async () => {
  const env = { APC_CONTENT_OS_AUTH: "test-secret" };
  const rejected = await authorize({
    env,
    request: new Request("https://example.com/content-os/"),
    next: () => new Response("private"),
  });
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get("WWW-Authenticate"), /Basic/);

  const accepted = await authorize({
    env,
    request: new Request("https://example.com/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:test-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "private");
  assert.equal(accepted.headers.get("X-Frame-Options"), "DENY");
});

test("preview routes can verify the high-entropy password hash from KV", async () => {
  const kv = new MemoryKV();
  await kv.put("apc-content-os:auth:sha256", "9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6");
  const response = await authorize({
    env: { APC_CONTENT_OS_STATE: kv },
    request: new Request("https://preview.example/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:test-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(response.status, 200);
});

test("GET returns an empty canonical record before first migration", async () => {
  const env = { APC_CONTENT_OS_STATE: new MemoryKV() };
  const response = await onRequestGet({ env });
  assert.deepEqual(await response.json(), {
    schemaVersion: "2.1",
    revision: 0,
    updatedAt: null,
    state: null,
  });
});

test("PUT creates a revision and rejects a stale overwrite", async () => {
  const env = { APC_CONTENT_OS_STATE: new MemoryKV() };
  const first = await onRequestPut({ request: putRequest({ expectedRevision: 0, state: baseState() }), env });
  assert.equal(first.status, 200);
  const firstRecord = await first.json();
  assert.equal(firstRecord.revision, 1);
  assert.ok(firstRecord.updatedAt);

  const staleState = baseState();
  staleState.results.push({ id: 1 });
  const stale = await onRequestPut({ request: putRequest({ expectedRevision: 0, state: staleState }), env });
  assert.equal(stale.status, 409);
  const current = await stale.json();
  assert.equal(current.revision, 1);
  assert.deepEqual(current.state.results, []);
});

test("PUT rejects cross-origin, malformed, and invalid-schema writes", async () => {
  const env = { APC_CONTENT_OS_STATE: new MemoryKV() };
  const crossOrigin = await onRequestPut({
    request: putRequest({ expectedRevision: 0, state: baseState() }, { Origin: "https://attacker.example" }),
    env,
  });
  assert.equal(crossOrigin.status, 403);

  const malformed = await onRequestPut({
    request: new Request(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://example.com", "X-APC-Content-OS": "1" },
      body: "{",
    }),
    env,
  });
  assert.equal(malformed.status, 400);

  const invalid = await onRequestPut({ request: putRequest({ expectedRevision: 0, state: {} }), env });
  assert.equal(invalid.status, 400);
});
