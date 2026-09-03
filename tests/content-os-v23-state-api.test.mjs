import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_BODY_BYTES,
  onRequest as stateRoute,
  onRequestGet as getState,
  onRequestPut as putState,
} from "../functions/api/content-os/state.js";
import {
  onRequest as historyRoute,
  onRequestGet as getHistory,
  onRequestPost as restoreHistory,
} from "../functions/api/content-os/history.js";
import { defaultContentOsState } from "../content-os/schema.js";

const stateEndpoint = "https://example.com/api/content-os/state";
const historyEndpoint = "https://example.com/api/content-os/history";

function calendarEntry(status) {
  return { status, topic: "", area: "", family: "", stage: "" };
}

function historyCursor(beforeRevision) {
  return btoa(JSON.stringify({ beforeRevision }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function addHistoryRevision(database, revision) {
  database.revisions.set(revision, {
    revision,
    schema_version: "2.3",
    updated_at: "2026-09-02T01:02:03.000Z",
    action: "edit",
    request_id: `request:history:${String(revision).padStart(8, "0")}`,
    restored_from_revision: null,
    state_hash: String(revision).padStart(64, "0"),
    state_json: "must not be returned",
  });
}

function state(overrides = {}) {
  return {
    ...defaultContentOsState(),
    calendar: { "2026-09-01": calendarEntry("posted") },
    ...overrides,
  };
}

function stateRequest(body, {
  method = "PUT",
  origin = "https://example.com",
  intent = "1",
  contentType = "application/json",
  extraHeaders = {},
  url = stateEndpoint,
} = {}) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": contentType,
      "Origin": origin,
      "X-APC-Content-OS": intent,
      ...extraHeaders,
    },
    body: body === undefined ? undefined : (typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body)),
  });
}

function writePayload(overrides = {}) {
  return {
    expectedRevision: 0,
    state: state(),
    action: "edit",
    requestId: "request:state:00000001",
    ...overrides,
  };
}

function restoreRequest(body, options = {}) {
  return stateRequest(body, { ...options, method: "POST", url: historyEndpoint });
}

class StateStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    if (/FROM content_os_state WHERE id = \?/.test(this.sql)) {
      return this.params[0] === 1 ? { ...this.database.row } : null;
    }
    if (/FROM content_os_revisions WHERE revision = \?/.test(this.sql)) {
      const revision = this.database.revisions.get(this.params[0]);
      return revision ? { ...revision } : null;
    }
    throw new Error(`Unhandled first() query: ${this.sql}`);
  }

  async all() {
    if (/FROM content_os_revisions\s+(?:WHERE revision < \?\s+)?ORDER BY revision DESC LIMIT \?/.test(this.sql)) {
      const hasBoundary = /WHERE revision < \?/.test(this.sql);
      const beforeRevision = hasBoundary ? this.params[0] : null;
      const limit = this.params[hasBoundary ? 1 : 0];
      const rows = [...this.database.revisions.values()]
        .filter(row => beforeRevision === null || row.revision < beforeRevision)
        .sort((left, right) => right.revision - left.revision)
        .slice(0, limit);
      return { results: rows.map(row => ({ ...row })) };
    }
    throw new Error(`Unhandled all() query: ${this.sql}`);
  }

  async run() {
    if (/UPDATE content_os_state/.test(this.sql)) {
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
      const requestIdExists = [...this.database.revisions.values()]
        .some(revision => revision.request_id === uniqueRequestId);
      if (id !== 1 || this.database.row.revision !== expectedRevision || requestIdExists) {
        return { success: true, meta: { changes: 0 } };
      }
      const revision = expectedRevision + 1;
      this.database.row = {
        schema_version: schemaVersion,
        revision,
        updated_at: updatedAt,
        state_json: stateJson,
        state_hash: stateHash,
        last_action: action,
        last_request_id: requestId,
        restored_from_revision: restoredFromRevision,
      };
      this.database.revisions.set(revision, {
        revision,
        schema_version: schemaVersion,
        updated_at: updatedAt,
        action,
        request_id: requestId,
        restored_from_revision: restoredFromRevision,
        state_hash: stateHash,
        state_json: stateJson,
      });
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run() query: ${this.sql}`);
  }
}

class MemoryStateDatabase {
  constructor() {
    this.row = {
      schema_version: "2.3",
      revision: 0,
      updated_at: null,
      state_json: null,
      state_hash: null,
      last_action: "legacy",
      last_request_id: null,
      restored_from_revision: null,
    };
    this.revisions = new Map();
  }

  prepare(sql) {
    return new StateStatement(this, sql);
  }
}

async function independentSha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

test("state route allows GET and PUT only", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryStateDatabase() };
  const get = await stateRoute({ request: new Request(stateEndpoint), env });
  assert.equal(get.status, 200);

  const put = await stateRoute({ request: stateRequest(writePayload()), env });
  assert.equal(put.status, 200);

  for (const method of ["POST", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await stateRoute({ request: new Request(stateEndpoint, { method }), env });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "GET, PUT");
  }
});

test("state reads and writes reject query parameters", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryStateDatabase() };
  const get = await getState({
    request: new Request(stateEndpoint + "?unexpected=1"),
    env,
  });
  assert.equal(get.status, 400);

  const put = await putState({
    request: stateRequest(writePayload(), { url: stateEndpoint + "?unexpected=1" }),
    env,
  });
  assert.equal(put.status, 400);
  assert.equal(env.APC_CONTENT_OS_DB.row.revision, 0);
});

test("GET returns the complete empty canonical contract", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryStateDatabase() };
  const response = await getState({ env });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
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

test("PUT stores server time, canonical hash, action, request ID, and one revision", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const submittedState = state({ updatedAt: null });
  const response = await putState({
    request: stateRequest(writePayload({ state: submittedState })),
    env,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schemaVersion, "2.3");
  assert.equal(body.revision, 1);
  assert.equal(body.lastAction, "edit");
  assert.equal(body.lastRequestId, "request:state:00000001");
  assert.equal(body.restoredFromRevision, null);
  assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.state.updatedAt, body.updatedAt);
  assert.equal(body.stateHash, await independentSha256(JSON.stringify(body.state)));
  assert.equal(database.revisions.size, 1);
  assert.deepEqual(JSON.parse(database.row.state_json), body.state);
  assert.equal(database.row.state_hash, body.stateHash);
});

test("PUT accepts exact keys only and applies deep schema validation", async () => {
  const invalidCases = [
    { ...writePayload(), extra: true },
    (() => { const value = writePayload(); delete value.action; return value; })(),
    writePayload({ action: "Restore With Spaces" }),
    writePayload({ action: "restore" }),
    writePayload({ requestId: "short" }),
    writePayload({ expectedRevision: -1 }),
    writePayload({ state: { ...state(), privateMessages: [] } }),
    writePayload({
      state: {
        ...state(),
        calendar: { "2026-09-01": calendarEntry('\"><img onerror=alert(1)>') },
      },
    }),
  ];
  for (const invalid of invalidCases) {
    const database = new MemoryStateDatabase();
    const response = await putState({ request: stateRequest(invalid), env: { APC_CONTENT_OS_DB: database } });
    assert.equal(response.status, 400);
    assert.equal(database.row.revision, 0);
    assert.equal(database.revisions.size, 0);
  }
});

test("PUT rejects cross-origin, missing intent, invalid media, malformed UTF-8, and oversized bodies", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const cases = [
    [stateRequest(writePayload(), { origin: "https://attacker.example" }), 403],
    [stateRequest(writePayload(), { intent: "0" }), 400],
    [stateRequest(writePayload(), { contentType: "text/plain" }), 415],
    [stateRequest("{", {}), 400],
    [stateRequest(new Uint8Array([0xc3, 0x28])), 400],
    [stateRequest("x".repeat(MAX_BODY_BYTES + 1)), 413],
    [stateRequest(writePayload(), { extraHeaders: { "Content-Length": String(MAX_BODY_BYTES + 1) } }), 413],
  ];
  for (const [candidate, status] of cases) {
    const response = await putState({ request: candidate, env });
    assert.equal(response.status, status);
  }
  assert.equal(database.row.revision, 0);
});

test("concurrent writers yield exactly one success and preserve the winner", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const writerA = writePayload({
    state: state({ calendar: { "2026-09-01": calendarEntry("ready") } }),
    requestId: "request:writer:00000001",
  });
  const writerB = writePayload({
    state: state({ calendar: { "2026-09-01": calendarEntry("stop") } }),
    requestId: "request:writer:00000002",
  });

  const responses = await Promise.all([
    putState({ request: stateRequest(writerA), env }),
    putState({ request: stateRequest(writerB), env }),
  ]);
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 1);
  const success = await responses.find(response => response.status === 200).json();
  const conflict = await responses.find(response => response.status === 409).json();
  assert.deepEqual(conflict, success);
  assert.equal(database.row.revision, 1);
  assert.equal(database.revisions.size, 1);
});

test("a lost-response retry is idempotent but changed reuse of the request ID conflicts", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const original = writePayload();

  const first = await putState({ request: stateRequest(original), env });
  assert.equal(first.status, 200);
  const firstRecord = await first.json();
  assert.equal(firstRecord.revision, 1);

  const exactRetry = await putState({ request: stateRequest(original), env });
  assert.equal(exactRetry.status, 200);
  assert.deepEqual(await exactRetry.json(), firstRecord);
  assert.equal(database.row.revision, 1);
  assert.equal(database.revisions.size, 1);

  const altered = writePayload({
    state: state({ calendar: { "2026-09-01": calendarEntry("stop") } }),
  });
  const conflictingReuse = await putState({ request: stateRequest(altered), env });
  assert.equal(conflictingReuse.status, 409);
  assert.equal(database.row.revision, 1);
  assert.equal(database.revisions.size, 1);
});

test("a request ID cannot be reused at the current revision", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const requestId = "request:state:reused0001";
  const first = writePayload({ requestId });
  assert.equal((await putState({ request: stateRequest(first), env })).status, 200);

  const reused = writePayload({
    expectedRevision: 1,
    requestId,
    state: state({ calendar: { "2026-09-01": calendarEntry("stop") } }),
  });
  const response = await putState({ request: stateRequest(reused), env });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.revision, 1);
  assert.equal(body.state.calendar["2026-09-01"].status, "posted");
  assert.equal(database.row.revision, 1);
  assert.equal(database.revisions.size, 1);
});

test("GET fails closed if canonical state hash is tampered", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  assert.equal((await putState({ request: stateRequest(writePayload()), env })).status, 200);
  database.row.state_hash = "0".repeat(64);
  const response = await getState({ env });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Canonical state is unavailable." });
});

test("GET rejects JSON null, arrays, and primitives stored as canonical state", async () => {
  for (const hostileStoredValue of ["null", "[]", "42", '"text"']) {
    const database = new MemoryStateDatabase();
    database.row = {
      schema_version: "2.3",
      revision: 1,
      updated_at: "2026-09-02T01:02:03.000Z",
      state_json: hostileStoredValue,
      state_hash: await independentSha256(hostileStoredValue),
      last_action: "edit",
      last_request_id: "request:state:00000001",
      restored_from_revision: null,
    };
    const response = await getState({ env: { APC_CONTENT_OS_DB: database } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Canonical state is unavailable." });
  }
});

test("GET rejects noninitial empty rows and schema downgrade mismatches", async () => {
  const noninitialEmpty = new MemoryStateDatabase();
  noninitialEmpty.row.revision = 1;
  const emptyResponse = await getState({ env: { APC_CONTENT_OS_DB: noninitialEmpty } });
  assert.equal(emptyResponse.status, 503);
  assert.deepEqual(await emptyResponse.json(), { error: "Canonical state is unavailable." });

  const downgrade = new MemoryStateDatabase();
  const currentState = state({ updatedAt: "2026-09-02T01:02:03.000Z" });
  downgrade.row = {
    schema_version: "2.2",
    revision: 1,
    updated_at: currentState.updatedAt,
    state_json: JSON.stringify(currentState),
    state_hash: "legacy-unhashed",
    last_action: "legacy",
    last_request_id: null,
    restored_from_revision: null,
  };
  const downgradeResponse = await getState({ env: { APC_CONTENT_OS_DB: downgrade } });
  assert.equal(downgradeResponse.status, 503);
  assert.deepEqual(await downgradeResponse.json(), { error: "Canonical state is unavailable." });

  const invalidProvenance = new MemoryStateDatabase();
  assert.equal((await putState({
    request: stateRequest(writePayload()),
    env: { APC_CONTENT_OS_DB: invalidProvenance },
  })).status, 200);
  invalidProvenance.row.restored_from_revision = 0;
  const provenanceResponse = await getState({ env: { APC_CONTENT_OS_DB: invalidProvenance } });
  assert.equal(provenanceResponse.status, 503);
  assert.deepEqual(await provenanceResponse.json(), { error: "Canonical state is unavailable." });
});

test("legacy rows are explicitly migrated on read without mutating storage", async () => {
  const database = new MemoryStateDatabase();
  const legacy = {
    version: "2.1",
    calendar: {},
    results: [],
    products: {},
    book: [],
    lastBackupAt: null,
    lastBackupResultCount: 0,
    updatedAt: null,
  };
  database.row = {
    schema_version: "2.1",
    revision: 4,
    updated_at: null,
    state_json: JSON.stringify(legacy),
    state_hash: "legacy-unhashed",
    last_action: "legacy",
    last_request_id: null,
    restored_from_revision: null,
  };
  const originalJson = database.row.state_json;
  const response = await getState({ env: { APC_CONTENT_OS_DB: database } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schemaVersion, "2.3");
  assert.equal(body.state.version, "2.3");
  assert.match(body.stateHash, /^[0-9a-f]{64}$/);
  assert.equal(database.row.state_json, originalJson);
});

test("history returns bounded metadata without state payloads", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  assert.equal((await putState({ request: stateRequest(writePayload()), env })).status, 200);
  const second = writePayload({
    expectedRevision: 1,
    state: state({ calendar: { "2026-09-01": calendarEntry("validated") } }),
    requestId: "request:state:00000002",
  });
  assert.equal((await putState({ request: stateRequest(second), env })).status, 200);

  const response = await getHistory({ request: new Request(`${historyEndpoint}?limit=1`), env });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["nextCursor", "revisions", "schemaVersion"]);
  assert.equal(body.schemaVersion, "2.3");
  assert.equal(body.revisions.length, 1);
  assert.equal(body.revisions[0].revision, 2);
  assert.equal(typeof body.nextCursor, "string");
  assert.deepEqual(Object.keys(body.revisions[0]).sort(), [
    "action",
    "requestId",
    "restoredFromRevision",
    "revision",
    "schemaVersion",
    "stateHash",
    "updatedAt",
  ]);
  assert.equal(Object.hasOwn(body.revisions[0], "state"), false);
  assert.equal(Object.hasOwn(body.revisions[0], "stateJson"), false);

  const invalidCursors = [
    "",
    "not-a-cursor",
    "x".repeat(129),
    historyCursor(0),
    historyCursor(1.5),
    btoa(JSON.stringify({ revision: 1 })).replace(/=+$/g, ""),
    btoa(JSON.stringify({ beforeRevision: 1, extra: true })).replace(/=+$/g, ""),
  ];
  const invalidQueries = [
    "?limit=",
    "?limit=0",
    "?limit=01",
    "?limit=101",
    "?limit=abc",
    "?limit=1&limit=2",
    "?cursor=abc&cursor=def",
    "?unknown=1",
    ...invalidCursors.map(cursor => `?cursor=${encodeURIComponent(cursor)}`),
  ];
  for (const query of invalidQueries) {
    const invalid = await getHistory({ request: new Request(historyEndpoint + query), env });
    assert.equal(invalid.status, 400, query);
  }
});

test("history cursor pagination is bounded, stable, deterministic, and complete", async () => {
  const database = new MemoryStateDatabase();
  for (let revision = 1; revision <= 5; revision += 1) {
    addHistoryRevision(database, revision);
  }
  const env = { APC_CONTENT_OS_DB: database };

  const firstResponse = await getHistory({
    request: new Request(`${historyEndpoint}?limit=2`),
    env,
  });
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.deepEqual(first.revisions.map(record => record.revision), [5, 4]);
  assert.match(first.nextCursor, /^[A-Za-z0-9_-]{1,128}$/);

  addHistoryRevision(database, 6);
  const secondUrl = new URL(historyEndpoint);
  secondUrl.searchParams.set("limit", "2");
  secondUrl.searchParams.set("cursor", first.nextCursor);
  const secondResponse = await getHistory({ request: new Request(secondUrl), env });
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.deepEqual(second.revisions.map(record => record.revision), [3, 2]);
  assert.match(second.nextCursor, /^[A-Za-z0-9_-]{1,128}$/);

  const thirdUrl = new URL(historyEndpoint);
  thirdUrl.searchParams.set("limit", "2");
  thirdUrl.searchParams.set("cursor", second.nextCursor);
  const thirdResponse = await getHistory({ request: new Request(thirdUrl), env });
  assert.equal(thirdResponse.status, 200);
  const third = await thirdResponse.json();
  assert.deepEqual(third.revisions.map(record => record.revision), [1]);
  assert.equal(third.nextCursor, null);
  assert.deepEqual(
    [...first.revisions, ...second.revisions, ...third.revisions].map(record => record.revision),
    [5, 4, 3, 2, 1],
  );

  const replay = await (await getHistory({ request: new Request(secondUrl), env })).json();
  assert.deepEqual(replay, second);
  assert.equal(
    [...first.revisions, ...second.revisions, ...third.revisions]
      .some(record => Object.hasOwn(record, "state") || Object.hasOwn(record, "stateJson")),
    false,
  );
});

test("history never returns more than 100 revisions in one page", async () => {
  const database = new MemoryStateDatabase();
  for (let revision = 1; revision <= 101; revision += 1) {
    addHistoryRevision(database, revision);
  }
  const response = await getHistory({
    request: new Request(`${historyEndpoint}?limit=100`),
    env: { APC_CONTENT_OS_DB: database },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.revisions.length, 100);
  assert.deepEqual(
    body.revisions.map(record => record.revision),
    Array.from({ length: 100 }, (_, index) => 101 - index),
  );
  assert.equal(typeof body.nextCursor, "string");
});

test("restore creates a new revision and leaves the historical target unchanged", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const firstState = state({ calendar: { "2026-09-01": calendarEntry("ready") } });
  assert.equal((await putState({
    request: stateRequest(writePayload({ state: firstState })),
    env,
  })).status, 200);
  const historicalJson = database.revisions.get(1).state_json;

  const second = writePayload({
    expectedRevision: 1,
    state: state({ calendar: { "2026-09-01": calendarEntry("stop") } }),
    requestId: "request:state:00000002",
  });
  assert.equal((await putState({ request: stateRequest(second), env })).status, 200);

  const restore = await restoreHistory({
    request: restoreRequest({
      expectedRevision: 2,
      revision: 1,
      requestId: "request:restore:000001",
    }),
    env,
  });
  assert.equal(restore.status, 200);
  const body = await restore.json();
  assert.equal(body.revision, 3);
  assert.equal(body.restoredFromRevision, 1);
  assert.equal(body.lastAction, "restore");
  assert.equal(body.state.calendar["2026-09-01"].status, "ready");
  assert.equal(database.revisions.size, 3);
  assert.equal(database.revisions.get(1).state_json, historicalJson);
  assert.equal(database.revisions.get(3).action, "restore");
  assert.equal(database.revisions.get(3).restored_from_revision, 1);
  assert.equal(database.row.restored_from_revision, 1);

  const retry = await restoreHistory({
    request: restoreRequest({
      expectedRevision: 2,
      revision: 1,
      requestId: "request:restore:000001",
    }),
    env,
  });
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.equal(retryBody.idempotent, true);
  assert.equal(retryBody.restoredFromRevision, 1);
  assert.equal(database.revisions.size, 3);

  const history = await getHistory({ request: new Request(`${historyEndpoint}?limit=10`), env });
  assert.equal(history.status, 200);
  const historyBody = await history.json();
  const restoredRevision = historyBody.revisions.find(record => record.revision === 3);
  assert.equal(restoredRevision.restoredFromRevision, 1);
  assert.equal(historyBody.revisions.find(record => record.revision === 2).restoredFromRevision, null);

  const editAfterRestore = await putState({
    request: stateRequest(writePayload({
      expectedRevision: 3,
      state: state({ calendar: { "2026-09-01": calendarEntry("validated") } }),
      requestId: "request:state:00000004",
    })),
    env,
  });
  assert.equal(editAfterRestore.status, 200);
  const editBody = await editAfterRestore.json();
  assert.equal(editBody.revision, 4);
  assert.equal(editBody.restoredFromRevision, null);
  assert.equal(database.row.restored_from_revision, null);
  assert.equal(database.revisions.get(4).restored_from_revision, null);
});

test("missing and stale restores fail without rewriting canonical state", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  assert.equal((await putState({ request: stateRequest(writePayload()), env })).status, 200);
  const before = structuredClone(database.row);

  const missing = await restoreHistory({
    request: restoreRequest({
      expectedRevision: 1,
      revision: 999,
      requestId: "request:restore:000001",
    }),
    env,
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(database.row, before);

  const stale = await restoreHistory({
    request: restoreRequest({
      expectedRevision: 0,
      revision: 1,
      requestId: "request:restore:000002",
    }),
    env,
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(database.row, before);
  assert.equal(database.revisions.size, 1);
});

test("restore replay identity includes the source revision", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const repeatedState = state({ calendar: { "2026-09-01": calendarEntry("ready") } });
  assert.equal((await putState({
    request: stateRequest(writePayload({ state: repeatedState })),
    env,
  })).status, 200);
  assert.equal((await putState({
    request: stateRequest(writePayload({
      expectedRevision: 1,
      state: state({ calendar: { "2026-09-01": calendarEntry("stop") } }),
      requestId: "request:state:00000002",
    })),
    env,
  })).status, 200);
  assert.equal((await putState({
    request: stateRequest(writePayload({
      expectedRevision: 2,
      state: repeatedState,
      requestId: "request:state:00000003",
    })),
    env,
  })).status, 200);

  const requestId = "request:restore:identity1";
  assert.equal((await restoreHistory({
    request: restoreRequest({ expectedRevision: 3, revision: 1, requestId }),
    env,
  })).status, 200);
  const wrongSourceReplay = await restoreHistory({
    request: restoreRequest({ expectedRevision: 3, revision: 3, requestId }),
    env,
  });
  assert.equal(wrongSourceReplay.status, 409);
  assert.equal((await wrongSourceReplay.json()).restoredFromRevision, 1);
  assert.equal(database.row.revision, 4);
  assert.equal(database.revisions.size, 4);
});

test("restore rejects unknown and mismatched historical schemas", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  assert.equal((await putState({ request: stateRequest(writePayload()), env })).status, 200);
  const original = structuredClone(database.revisions.get(1));

  for (const [schemaVersion, stateJson] of [
    ["9.9", original.state_json],
    ["2.2", original.state_json],
  ]) {
    database.revisions.set(1, {
      ...original,
      schema_version: schemaVersion,
      state_json: stateJson,
    });
    const response = await restoreHistory({
      request: restoreRequest({
        expectedRevision: 1,
        revision: 1,
        requestId: `request:restore:${schemaVersion.replace(".", "")}`,
      }),
      env,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Revision could not be restored." });
    assert.equal(database.row.revision, 1);
    assert.equal(database.revisions.size, 1);
  }
});

test("history fails closed when restore provenance is missing or impossible", async () => {
  const database = new MemoryStateDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  assert.equal((await putState({ request: stateRequest(writePayload()), env })).status, 200);
  const original = database.revisions.get(1);

  database.revisions.set(1, {
    ...original,
    action: "restore",
    restored_from_revision: null,
  });
  const missing = await getHistory({ request: new Request(historyEndpoint), env });
  assert.equal(missing.status, 503);

  database.revisions.set(1, {
    ...original,
    action: "restore",
    restored_from_revision: 1,
  });
  const impossible = await getHistory({ request: new Request(historyEndpoint), env });
  assert.equal(impossible.status, 503);
});

test("history fails closed for corrupt stored audit metadata", async () => {
  const mutations = [
    { schema_version: "9.9" },
    { updated_at: "2026-02-30T01:02:03.000Z" },
    { updated_at: null },
    { action: "unknown" },
    { request_id: null },
    { state_hash: "not-a-hash" },
  ];
  for (const mutation of mutations) {
    const database = new MemoryStateDatabase();
    addHistoryRevision(database, 1);
    database.revisions.set(1, { ...database.revisions.get(1), ...mutation });
    const response = await getHistory({
      request: new Request(historyEndpoint),
      env: { APC_CONTENT_OS_DB: database },
    });
    assert.equal(response.status, 503, JSON.stringify(mutation));
    assert.deepEqual(await response.json(), { error: "Revision history is unavailable." });
  }
});

test("history route allows GET and POST only", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryStateDatabase() };
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await historyRoute({ request: new Request(historyEndpoint, { method }), env });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "GET, POST");
  }
});
