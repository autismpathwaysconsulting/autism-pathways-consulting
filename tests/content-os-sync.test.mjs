import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequest as authorize } from "../functions/_middleware.js";
import { onRequestGet, onRequestPut } from "../functions/api/content-os/state.js";
import { defaultContentOsState } from "../content-os/schema.js";

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return type === "json" && value ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
}

class MemoryD1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() {
    this.database.operations.push({ type: "read", sql: this.sql });
    return this.database.row ? { ...this.database.row } : null;
  }
  async run() {
    this.database.operations.push({ type: "write", sql: this.sql });
    return this.database.serialize(async () => {
      const [
        schemaVersion,
        updatedAt,
        stateJson,
        action,
        requestId,
        stateHash,
        restoredFromRevision,
        id,
        expectedRevision,
        uniqueRequestId,
      ] = this.params;
      if (
        !this.database.row ||
        id !== 1 ||
        this.database.row.revision !== expectedRevision ||
        this.database.requestIds.has(uniqueRequestId)
      ) {
        return { success: true, meta: { changes: 0, rows_written: 0 }, results: [] };
      }
      this.database.row = {
        id: 1,
        schema_version: schemaVersion,
        revision: this.database.row.revision + 1,
        updated_at: updatedAt,
        state_json: stateJson,
        last_action: action,
        last_request_id: requestId,
        state_hash: stateHash,
        restored_from_revision: restoredFromRevision,
      };
      this.database.requestIds.add(requestId);
      return { success: true, meta: { changes: 1, rows_written: 1 }, results: [] };
    });
  }
}

class MemoryD1 {
  constructor() {
    this.row = {
      id: 1,
      schema_version: "2.3",
      revision: 0,
      updated_at: null,
      state_json: null,
      last_action: "legacy",
      last_request_id: null,
      state_hash: null,
      restored_from_revision: null,
    };
    this.operations = [];
    this.requestIds = new Set();
    this.queue = Promise.resolve();
  }
  prepare(sql) { return new MemoryD1Statement(this, sql); }
  serialize(work) {
    const result = this.queue.then(work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

const endpoint = "https://example.com/api/content-os/state";
const baseState = () => defaultContentOsState();
const calendarEntry = status => ({ status, topic: "", area: "", family: "", stage: "" });

function putRequest(body, extraHeaders = {}) {
  const payload = body && Object.hasOwn(body, "state")
    ? {
        action: "edit",
        requestId: "request:sync:00000001",
        ...body,
      }
    : body;
  return new Request(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "X-APC-Content-OS": "1",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
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

test("production secret accepts only the production credential", async () => {
  const previewVerifier = new MemoryKV();
  await previewVerifier.put("apc-content-os:auth:sha256", "9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6");
  const env = {
    APC_CONTENT_OS_ENVIRONMENT: "production",
    APC_CONTENT_OS_AUTH: "production-secret",
    APC_CONTENT_OS_PREVIEW_AUTH: previewVerifier,
    APC_CONTENT_OS_PREVIEW_AUTH_ENABLED: "true",
    CF_PAGES: "1",
    CF_PAGES_BRANCH: "main",
  };
  const rejected = await authorize({
    env,
    request: new Request("https://example.com/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:test-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(rejected.status, 302);
  assert.equal(rejected.headers.get("Location"), "https://example.com/content-os/login/");

  const accepted = await authorize({
    env,
    request: new Request("https://example.com/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:production-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "private");
  assert.equal(accepted.headers.get("X-Frame-Options"), "DENY");
});

test("browser login accepts a same-site submission without Origin", async () => {
  const env = { APC_CONTENT_OS_ENVIRONMENT: "production", APC_CONTENT_OS_AUTH: "production-secret" };
  const loginPage = await authorize({ env, request: new Request("https://example.com/content-os/login/"), next: () => new Response("private") });
  const html = await loginPage.text();
  const csrf = /action="\/content-os\/login\/\?csrf=([0-9a-f.-]+)"/.exec(html)?.[1];
  assert.ok(csrf);
  const body = new URLSearchParams({ password: "production-secret" });
  const response = await authorize({
    env,
    request: new Request(`https://example.com/content-os/login/?csrf=${csrf}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
    next: () => new Response("private"),
  });
  assert.equal(response.status, 303);
  assert.match(response.headers.get("Set-Cookie"), /__Host-apc_content_os_session=/);
});

test("preview verifier works only for an explicit preview environment", async () => {
  const kv = new MemoryKV();
  await kv.put("apc-content-os:auth:sha256", "9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6");
  const response = await authorize({
    env: {
      APC_CONTENT_OS_ENVIRONMENT: "preview",
      APC_CONTENT_OS_PREVIEW_AUTH: kv,
      APC_CONTENT_OS_PREVIEW_AUTH_ENABLED: "true",
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "feature-preview",
    },
    request: new Request("https://preview.example/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:test-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(response.status, 200);
  const productionBranch = await authorize({
    env: {
      APC_CONTENT_OS_ENVIRONMENT: "preview",
      APC_CONTENT_OS_PREVIEW_AUTH: kv,
      APC_CONTENT_OS_PREVIEW_AUTH_ENABLED: "true",
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "main",
    },
    request: new Request("https://preview.example/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:test-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(productionBranch.status, 503);

  const invalidPreviewCredential = await authorize({
    env: {
      APC_CONTENT_OS_ENVIRONMENT: "preview",
      APC_CONTENT_OS_PREVIEW_AUTH: kv,
      APC_CONTENT_OS_PREVIEW_AUTH_ENABLED: "true",
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "feature-preview",
    },
    request: new Request("https://preview.example/content-os/", {
      headers: { Authorization: `Basic ${btoa("apc:wrong-secret")}` },
    }),
    next: () => new Response("private"),
  });
  assert.equal(invalidPreviewCredential.status, 401);
});

test("only the exact research webhook POST bypasses dashboard authentication", async () => {
  const accepted = await authorize({
    env: {},
    request: new Request("https://example.com/api/content-os/ingest/research-github", {
      method: "POST",
    }),
    next: () => new Response("webhook handler"),
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "webhook handler");
  assert.equal(accepted.headers.get("Cache-Control"), "private, no-store");

  for (const request of [
    new Request("https://example.com/api/content-os/ingest/research-github"),
    new Request("https://example.com/api/content-os/ingest/research-github/", { method: "POST" }),
    new Request("https://example.com/api/content-os/ingest/research-github-copy", { method: "POST" }),
  ]) {
    const rejected = await authorize({
      env: {},
      request,
      next: () => new Response("must not run"),
    });
    assert.equal(rejected.status, 503);
  }
});

test("protected API routes require D1 before authentication is evaluated", async () => {
  const kv = new MemoryKV();
  await kv.put("apc-content-os:auth:sha256", "9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6");
  const response = await authorize({
    env: {
      APC_CONTENT_OS_ENVIRONMENT: "preview",
      APC_CONTENT_OS_PREVIEW_AUTH: kv,
      APC_CONTENT_OS_PREVIEW_AUTH_ENABLED: "true",
      CF_PAGES: "1",
      CF_PAGES_BRANCH: "feature-preview",
    },
    request: new Request("https://preview.example/api/content-os/state", {
      headers: { Authorization: `Basic ${btoa("apc:test-secret")}` },
    }),
    next: () => new Response("must not run"),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("GET returns an empty canonical record before first migration", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryD1() };
  const response = await onRequestGet({ env });
  assert.deepEqual(await response.json(), {
    schemaVersion: "2.3",
    revision: 0,
    updatedAt: null,
    stateHash: null,
    lastAction: "legacy",
    lastRequestId: null,
    restoredFromRevision: null,
    state: null,
  });
});

test("PUT creates a revision and rejects a stale overwrite", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryD1() };
  const first = await onRequestPut({ request: putRequest({ expectedRevision: 0, state: baseState() }), env });
  assert.equal(first.status, 200);
  const firstRecord = await first.json();
  assert.equal(firstRecord.revision, 1);
  assert.ok(firstRecord.updatedAt);

  const staleState = baseState();
  staleState.calendar["2026-09-01"] = calendarEntry("stop");
  const stale = await onRequestPut({ request: putRequest({ expectedRevision: 0, state: staleState }), env });
  assert.equal(stale.status, 409);
  const current = await stale.json();
  assert.equal(current.revision, 1);
  assert.deepEqual(current.state.results, []);
});

test("two concurrent writers at one revision produce one success and one conflict", async () => {
  const database = new MemoryD1();
  const env = { APC_CONTENT_OS_DB: database };
  const stateA = baseState();
  stateA.calendar["2026-09-01"] = calendarEntry("ready");
  const stateB = baseState();
  stateB.calendar["2026-09-01"] = calendarEntry("stop");

  const [responseA, responseB] = await Promise.all([
    onRequestPut({ request: putRequest({ expectedRevision: 0, state: stateA }), env }),
    onRequestPut({ request: putRequest({ expectedRevision: 0, state: stateB }), env }),
  ]);
  const responses = [responseA, responseB];
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 1);

  const successRecord = await responses.find(response => response.status === 200).json();
  const conflictRecord = await responses.find(response => response.status === 409).json();
  const canonicalRecord = await (await onRequestGet({ env })).json();
  assert.equal(canonicalRecord.revision, 1);
  assert.deepEqual(canonicalRecord.state, successRecord.state);
  assert.deepEqual(conflictRecord, canonicalRecord);
  assert.match(database.operations[0].sql, /WHERE id = \? AND revision = \?/);
  assert.equal(database.operations.slice(0, 2).every(operation => operation.type === "write"), true);
});

test("PUT rejects cross-origin, malformed, and invalid-schema writes", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryD1() };
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

test("configuration binds D1 as the only canonical state store", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../migrations/0001_content_os_state.sql", import.meta.url), "utf8");
  const hardeningMigration = await readFile(new URL("../migrations/0002_content_os_v23_hardening.sql", import.meta.url), "utf8");
  const handler = await readFile(new URL("../functions/api/content-os/state.js", import.meta.url), "utf8");

  assert.deepEqual(config.d1_databases, []);
  assert.deepEqual(config.kv_namespaces, []);
  assert.equal(config.env.preview.kv_namespaces[0].binding, "APC_CONTENT_OS_PREVIEW_AUTH");
  assert.equal(config.env.production.d1_databases[0].binding, "APC_CONTENT_OS_DB");
  assert.equal(config.env.production.d1_databases[0].database_name, "apc-content-os");
  assert.deepEqual(config.env.production.kv_namespaces, []);
  for (const previewDatabase of config.env.preview.d1_databases || []) {
    assert.notEqual(previewDatabase.database_id, config.env.production.d1_databases[0].database_id);
  }
  assert.doesNotMatch(handler, /APC_CONTENT_OS_STATE|\.put\(/);
  assert.match(handler, /UPDATE content_os_state[\s\S]+WHERE id = \? AND revision = \?/);
  assert.match(handler, /NOT EXISTS[\s\S]+FROM content_os_revisions WHERE request_id = \?/);
  assert.match(migration, /VALUES \(1, '2\.1', 0, NULL, NULL\)/);
  assert.match(hardeningMigration, /CREATE TABLE IF NOT EXISTS content_os_revisions/);
  assert.match(hardeningMigration, /content_os_revisions is append-only/);
});
