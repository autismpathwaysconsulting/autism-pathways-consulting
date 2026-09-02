import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_RESEARCH_WEBHOOK_BYTES,
  onRequestPost as ingestResearch,
  parseResearchWebhook,
  sha256Hex,
  verifyGithubSignature,
} from "../functions/api/content-os/ingest/research-github.js";
import {
  RESEARCH_FEED_SCHEMA,
  onRequestGet as getResearch,
  onRequestPost as decideResearch,
} from "../functions/api/content-os/research.js";
import {
  RESEARCH_BUNDLE_SCHEMA,
  canonicalResearchJson,
} from "../content-os/research-schema.js";

const encoder = new TextEncoder();
const ingestEndpoint = "https://example.com/api/content-os/ingest/research-github";
const researchEndpoint = "https://example.com/api/content-os/research";
const secret = "test-webhook-secret";

function weeklyRunId(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - start) / 86400000) + 1) / 7);
  return `apc-weekly-topic-review:${year}-W${String(week).padStart(2, "0")}`;
}

function bundle(overrides = {}) {
  const generatedAt = overrides.generated_at || new Date().toISOString();
  return {
    schema_version: RESEARCH_BUNDLE_SCHEMA,
    run_id: overrides.run_id || weeklyRunId(generatedAt),
    task_id: "apc-weekly-topic-review",
    generated_at: generatedAt,
    status: "complete",
    analytics_context: {
      status: "available",
      summary_run_id: "analytics:2026-W36",
      generated_at: generatedAt,
    },
    sources: [{
      id: "source:official_meta_01",
      name: "Meta official guidance",
      url: "https://www.facebook.com/business/help/example",
      published_at: null,
      accessed_at: generatedAt,
      type: "official_platform",
    }],
    findings: [{
      id: "finding:weekly_01",
      title: "A bounded content hypothesis",
      summary: "A de-identified summary grounded in the listed source.",
      evidence_status: "candidate_hypothesis",
      source_ids: ["source:official_meta_01"],
      limitations: "This does not establish a clinical rule.",
    }],
    topic_candidates: [{
      id: "topic:weekly_01",
      parent_problem: "Starting a familiar task still takes a long time.",
      hook: "The homework takes 20 minutes. Starting it takes 90.",
      possible_mechanism: "Starting and completing can place different demands on the child.",
      practical_action: "Identify and support the first visible action, then pause.",
      ending: "save",
      series: "What may be making this harder?",
      category: "Task initiation",
      format: "Reel",
      finding_ids: ["finding:weekly_01"],
      confidence: "medium",
      limitations: "Do not assume one cause.",
      prompt_seed: "Develop this as an APC episode with evidence controls.",
    }],
    ...overrides,
  };
}

function assertResearchPageContract(page) {
  assert.deepEqual(
    Object.keys(page).sort(),
    ["generatedAt", "items", "nextCursor", "runs", "schemaVersion"],
  );
  assert.equal(page.schemaVersion, RESEARCH_FEED_SCHEMA);
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(page.generatedAt));
  assert.ok(Array.isArray(page.runs));
  assert.ok(Array.isArray(page.items));
  assert.ok(page.nextCursor === null || /^[A-Za-z0-9_-]{1,256}$/.test(page.nextCursor));
}

function webhookPayload(researchBundle = bundle(), overrides = {}) {
  return {
    action: "opened",
    repository: {
      id: 1327407191,
      full_name: "autismpathwaysconsulting/APC-AI-OS",
      private: true,
    },
    sender: { login: "autismpathwaysconsulting" },
    issue: {
      id: 123456789,
      number: 42,
      user: { login: "autismpathwaysconsulting" },
      labels: [{ name: "apc-dashboard-feed" }],
      title: `APC Research Bundle: ${researchBundle.run_id}`,
      body: JSON.stringify(researchBundle),
    },
    ...overrides,
  };
}

async function hmacSignature(raw, signingSecret = secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(raw)));
  return `sha256=${Array.from(signature, value => value.toString(16).padStart(2, "0")).join("")}`;
}

async function ingestRequest(payload, {
  deliveryId = "11111111-1111-4111-8111-111111111111",
  event = "issues",
  signingSecret = secret,
  signature,
  contentType = "application/json",
  extraHeaders = {},
} = {}) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const suppliedSignature = signature === undefined ? await hmacSignature(raw, signingSecret) : signature;
  return new Request(ingestEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": suppliedSignature,
      ...extraHeaders,
    },
    body: raw,
  });
}

class ResearchStatement {
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
    if (/FROM automation_deliveries WHERE delivery_id/.test(this.sql)) {
      return this.database.deliveries.get(this.params[0]) || null;
    }
    if (/FROM research_runs WHERE run_id/.test(this.sql)) {
      return this.database.runs.get(this.params[0]) || null;
    }
    if (/FROM research_decisions WHERE request_id/.test(this.sql)) {
      return this.database.decisions.get(this.params[0]) || null;
    }
    if (/SELECT item_id FROM research_items WHERE item_id/.test(this.sql)) {
      return this.database.items.has(this.params[0]) ? { item_id: this.params[0] } : null;
    }
    throw new Error(`Unhandled first() query: ${this.sql}`);
  }

  async all() {
    if (/FROM research_runs/.test(this.sql)) {
      const hasCursor = /WHERE \(generated_at < \?/.test(this.sql);
      const limit = this.params.at(-1);
      let rows = [...this.database.runs.values()].sort((left, right) => {
        const dateOrder = right.generated_at.localeCompare(left.generated_at);
        return dateOrder || right.run_id.localeCompare(left.run_id);
      });
      if (hasCursor) {
        const [generatedAt, repeatedGeneratedAt, runId] = this.params;
        assert.equal(repeatedGeneratedAt, generatedAt);
        rows = rows.filter(row =>
          row.generated_at < generatedAt ||
          (row.generated_at === generatedAt && row.run_id < runId)
        );
      }
      return { results: rows.slice(0, limit) };
    }
    if (/FROM research_items i/.test(this.sql)) {
      const runIds = new Set(this.params);
      return {
        results: [...this.database.itemRows.values()]
          .filter(row => runIds.has(row.run_id))
          .map(row => {
            const decisions = [...this.database.decisions.values()]
              .filter(decision => decision.item_id === row.item_id);
            const decision = decisions.at(-1) || null;
            return {
              ...row,
              decision: decision?.decision || "new",
              decided_at: decision?.decided_at || null,
            };
          }),
      };
    }
    throw new Error(`Unhandled all() query: ${this.sql}`);
  }

  async run() {
    if (/INSERT INTO automation_deliveries/.test(this.sql)) {
      const [deliveryId, runId, receivedAt, payloadHash] = this.params;
      if (this.database.deliveries.has(deliveryId)) throw new Error("duplicate delivery");
      const status = this.sql.includes("'conflict'") ? "conflict" : "accepted";
      this.database.deliveries.set(deliveryId, {
        delivery_id: deliveryId,
        run_id: runId,
        received_at: receivedAt,
        payload_hash: payloadHash,
        status,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (/INSERT INTO research_runs/.test(this.sql)) {
      const [runId, generatedAt, receivedAt, status, analyticsStatus, payloadHash, bundleJson] = this.params;
      if (this.database.runs.has(runId)) throw new Error("duplicate run");
      this.database.runs.set(runId, {
        run_id: runId,
        generated_at: generatedAt,
        received_at: receivedAt,
        status,
        analytics_status: analyticsStatus,
        payload_hash: payloadHash,
        bundle_json: bundleJson,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (/INSERT INTO research_items/.test(this.sql)) {
      const [itemId, runId, title, createdAt, itemJson] = this.params;
      if (this.database.items.has(itemId)) throw new Error("duplicate item");
      this.database.items.add(itemId);
      this.database.itemRows.set(itemId, {
        item_id: itemId,
        run_id: runId,
        item_type: this.sql.includes("'finding'") ? "finding" : "topic",
        title,
        created_at: createdAt,
        item_json: itemJson,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (/INSERT INTO research_decisions/.test(this.sql)) {
      const [itemId, decision, decidedAt, requestId] = this.params;
      if (this.database.decisions.has(requestId)) throw new Error("duplicate request");
      this.database.decisions.set(requestId, {
        request_id: requestId,
        item_id: itemId,
        decision,
        decided_at: decidedAt,
      });
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run() query: ${this.sql}`);
  }
}

class MemoryResearchDatabase {
  constructor() {
    this.deliveries = new Map();
    this.runs = new Map();
    this.items = new Set();
    this.itemRows = new Map();
    this.decisions = new Map();
  }

  prepare(sql) {
    return new ResearchStatement(this, sql);
  }

  async batch(statements) {
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  }
}

test("GitHub HMAC validates exact bytes and rejects alterations", async () => {
  const raw = encoder.encode("{\"safe\":true}");
  const signature = await hmacSignature(new TextDecoder().decode(raw));
  assert.equal(await verifyGithubSignature(secret, raw, signature), true);
  assert.equal(await verifyGithubSignature(secret, encoder.encode("{\"safe\":false}"), signature), false);
  assert.equal(await verifyGithubSignature(secret, raw, "sha256=not-hex"), false);
  assert.equal(await verifyGithubSignature("", raw, signature), false);
  assert.equal(await sha256Hex(raw), "13f513fe32a8991557ebf28941b75597641e94717c08569b7723d998c7428423");
});

test("webhook parsing pins repository, sender, author, label, title, and freshness", () => {
  const now = new Date("2026-09-02T04:00:00.000Z");
  const researchBundle = bundle({ generated_at: "2026-09-02T03:00:00.000Z" });
  assert.deepEqual(parseResearchWebhook(webhookPayload(researchBundle), now), researchBundle);

  const mutations = [
    payload => { payload.action = "edited"; },
    payload => { payload.repository.id = 999; },
    payload => { payload.repository.full_name = "attacker/repo"; },
    payload => { payload.repository.private = false; },
    payload => { payload.sender.login = "attacker"; },
    payload => { payload.issue.user.login = "attacker"; },
    payload => { payload.issue.labels = []; },
    payload => { payload.issue.title = "Looks similar"; },
    payload => { payload.issue.pull_request = {}; },
  ];
  for (const mutate of mutations) {
    const payload = webhookPayload(researchBundle);
    mutate(payload);
    assert.throws(() => parseResearchWebhook(payload, now));
  }

  const stale = bundle({
    generated_at: "2026-08-30T00:00:00.000Z",
    run_id: "apc-weekly-topic-review:2026-W35",
  });
  assert.throws(() => parseResearchWebhook(webhookPayload(stale), now), /outside the accepted window/);
  const future = bundle({ generated_at: "2026-09-02T04:06:00.000Z" });
  assert.throws(() => parseResearchWebhook(webhookPayload(future), now), /outside the accepted window/);
});

test("research ingestion fails closed before touching storage", async () => {
  const database = new MemoryResearchDatabase();
  const validRequest = await ingestRequest(webhookPayload());

  const disabled = await ingestResearch({
    request: validRequest.clone(),
    env: { APC_CONTENT_OS_AUTOMATION_ENABLED: "false", APC_CONTENT_OS_DB: database },
  });
  assert.equal(disabled.status, 503);

  const missingDatabase = await ingestResearch({
    request: validRequest.clone(),
    env: { APC_CONTENT_OS_AUTOMATION_ENABLED: "true", APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret },
  });
  assert.equal(missingDatabase.status, 503);

  const badEvent = await ingestResearch({
    request: await ingestRequest(webhookPayload(), { event: "push" }),
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
      APC_CONTENT_OS_DB: database,
    },
  });
  assert.equal(badEvent.status, 403);

  const badSignature = await ingestResearch({
    request: await ingestRequest(webhookPayload(), { signature: "sha256=" + "0".repeat(64) }),
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
      APC_CONTENT_OS_DB: database,
    },
  });
  assert.equal(badSignature.status, 401);
  assert.equal(database.deliveries.size, 0);
  assert.equal(database.runs.size, 0);
});

test("research webhook body is byte-bounded before JSON processing", async () => {
  const database = new MemoryResearchDatabase();
  const env = {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
    APC_CONTENT_OS_DB: database,
  };
  const oversized = "x".repeat(MAX_RESEARCH_WEBHOOK_BYTES + 1);
  const response = await ingestResearch({ request: await ingestRequest(oversized), env });
  assert.equal(response.status, 413);
  assert.equal(database.deliveries.size, 0);
});

test("research webhook requires the exact JSON media type", async () => {
  const database = new MemoryResearchDatabase();
  const env = {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
    APC_CONTENT_OS_DB: database,
  };
  for (const contentType of [
    "application/json-patch+json",
    "application/jsonp",
    "application/json; charset=utf-8; profile=test",
    "text/application/json",
  ]) {
    const response = await ingestResearch({
      request: await ingestRequest(webhookPayload(), { contentType }),
      env,
    });
    assert.equal(response.status, 415, contentType);
  }
  const accepted = await ingestResearch({
    request: await ingestRequest(webhookPayload(), { contentType: "application/json; charset=UTF-8" }),
    env,
  });
  assert.equal(accepted.status, 202);
});

test("research webhook validates declared byte length", async () => {
  const envFor = database => ({
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
    APC_CONTENT_OS_DB: database,
  });
  const payload = webhookPayload();
  const raw = JSON.stringify(payload);
  const actualBytes = encoder.encode(raw).byteLength;

  const validDatabase = new MemoryResearchDatabase();
  const accepted = await ingestResearch({
    request: await ingestRequest(raw, { extraHeaders: { "Content-Length": String(actualBytes) } }),
    env: envFor(validDatabase),
  });
  assert.equal(accepted.status, 202);

  for (const [declared, expectedStatus] of [
    ["1", 400],
    ["-1", 400],
    ["1e3", 400],
    [String(MAX_RESEARCH_WEBHOOK_BYTES + 1), 413],
    ["999999999999999999999999999999", 413],
  ]) {
    const database = new MemoryResearchDatabase();
    const response = await ingestResearch({
      request: await ingestRequest(raw, { extraHeaders: { "Content-Length": declared } }),
      env: envFor(database),
    });
    assert.equal(response.status, expectedStatus, declared);
    assert.equal(database.runs.size, 0);
  }
});

test("accepted research is idempotent and altered reuse conflicts", async () => {
  const database = new MemoryResearchDatabase();
  const env = {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
    APC_CONTENT_OS_DB: database,
  };
  const researchBundle = bundle();
  const payload = webhookPayload(researchBundle);

  const accepted = await ingestResearch({ request: await ingestRequest(payload), env });
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).status, "accepted");
  assert.equal(database.deliveries.size, 1);
  assert.equal(database.runs.size, 1);
  assert.equal(database.items.size, 2);

  const duplicate = await ingestResearch({ request: await ingestRequest(payload), env });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).status, "duplicate");
  assert.equal(database.runs.size, 1);
  assert.equal(database.items.size, 2);

  const alteredBundle = bundle();
  alteredBundle.findings[0].summary = "Different valid content under the same run ID.";
  const conflict = await ingestResearch({
    request: await ingestRequest(webhookPayload(alteredBundle), {
      deliveryId: "22222222-2222-4222-8222-222222222222",
    }),
    env,
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "run_id_payload_conflict");
  assert.equal(database.runs.size, 1);
});

async function acceptedResearchDatabase() {
  const database = new MemoryResearchDatabase();
  const env = {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET: secret,
    APC_CONTENT_OS_DB: database,
  };
  const response = await ingestResearch({ request: await ingestRequest(webhookPayload()), env });
  assert.equal(response.status, 202);
  return { database, env: { APC_CONTENT_OS_DB: database } };
}

async function addStoredResearch(database, generatedAt, receivedAt = generatedAt) {
  const researchBundle = bundle({
    generated_at: generatedAt,
    run_id: weeklyRunId(generatedAt),
  });
  const runId = researchBundle.run_id;
  const payloadHash = await sha256Hex(encoder.encode(canonicalResearchJson(researchBundle)));
  database.runs.set(runId, {
    run_id: runId,
    generated_at: generatedAt,
    received_at: receivedAt,
    status: researchBundle.status,
    analytics_status: researchBundle.analytics_context.status,
    payload_hash: payloadHash,
    bundle_json: canonicalResearchJson(researchBundle),
  });
  for (const [type, records] of [
    ["finding", researchBundle.findings],
    ["topic", researchBundle.topic_candidates],
  ]) {
    for (const record of records) {
      const itemId = `${runId}|${record.id}`;
      database.items.add(itemId);
      database.itemRows.set(itemId, {
        item_id: itemId,
        run_id: runId,
        item_type: type,
        title: type === "finding" ? record.title : record.hook,
        created_at: receivedAt,
        item_json: canonicalResearchJson(record),
      });
    }
  }
  return runId;
}

test("research feed verifies stored bundle and item integrity", async () => {
  const healthy = await acceptedResearchDatabase();
  const response = await getResearch({ request: new Request(researchEndpoint), env: healthy.env });
  assert.equal(response.status, 200);
  const body = await response.json();
  assertResearchPageContract(body);
  assert.equal(body.runs.length, 1);
  assert.equal(body.items.length, 2);

  const mutations = [
    database => { [...database.runs.values()][0].payload_hash = "0".repeat(64); },
    database => {
      const run = [...database.runs.values()][0];
      const stored = JSON.parse(run.bundle_json);
      stored.findings[0].summary = "Valid but altered stored content.";
      run.bundle_json = JSON.stringify(stored);
    },
    database => { [...database.runs.values()][0].status = "no_change"; },
    database => {
      const row = [...database.itemRows.values()][0];
      const stored = JSON.parse(row.item_json);
      stored.summary = "Altered item JSON.";
      row.item_json = JSON.stringify(stored);
    },
    database => { [...database.itemRows.values()][0].title = "Altered title"; },
    database => { [...database.itemRows.values()][0].item_type = "topic"; },
    database => { [...database.itemRows.values()][0].run_id = "apc-weekly-topic-review:2026-W35"; },
    database => { database.itemRows.delete([...database.itemRows.keys()][0]); },
  ];
  for (const mutate of mutations) {
    const fixture = await acceptedResearchDatabase();
    mutate(fixture.database);
    const failed = await getResearch({ request: new Request(researchEndpoint), env: fixture.env });
    assert.equal(failed.status, 503);
  }
});

test("research feed cursor pagination is bounded, deterministic, and complete", async () => {
  const database = new MemoryResearchDatabase();
  const timestamps = [
    "2026-08-31T02:00:00.000Z",
    "2026-08-24T02:00:00.000Z",
    "2026-08-17T02:00:00.000Z",
    "2026-08-10T02:00:00.000Z",
    "2026-08-03T02:00:00.000Z",
  ];
  const expectedRunIds = [];
  for (const timestamp of timestamps.toReversed()) {
    expectedRunIds.push(await addStoredResearch(database, timestamp));
  }
  expectedRunIds.reverse();
  const env = { APC_CONTENT_OS_DB: database };

  const pages = [];
  let cursor = null;
  do {
    const url = new URL(researchEndpoint);
    url.searchParams.set("limit", "2");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await getResearch({ request: new Request(url), env });
    assert.equal(response.status, 200);
    const page = await response.json();
    assertResearchPageContract(page);
    assert.ok(page.runs.length >= 1 && page.runs.length <= 2);
    assert.equal(page.items.length, page.runs.length * 2);
    assert.ok(page.items.every(item => page.runs.some(run => run.runId === item.runId)));
    assert.ok(page.nextCursor === null || /^[A-Za-z0-9_-]{1,256}$/.test(page.nextCursor));
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor);

  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map(page => page.runs.length), [2, 2, 1]);
  assert.deepEqual(pages.flatMap(page => page.runs.map(run => run.runId)), expectedRunIds);
  assert.equal(new Set(pages.flatMap(page => page.runs.map(run => run.runId))).size, 5);
  assert.deepEqual(pages.map(page => page.nextCursor === null), [false, false, true]);
  assert.equal(new Set(pages.slice(0, -1).map(page => page.nextCursor)).size, 2);

  const replayUrl = new URL(researchEndpoint);
  replayUrl.searchParams.set("limit", "2");
  replayUrl.searchParams.set("cursor", pages[0].nextCursor);
  const replay = await (await getResearch({ request: new Request(replayUrl), env })).json();
  assertResearchPageContract(replay);
  assert.deepEqual(replay.runs.map(run => run.runId), pages[1].runs.map(run => run.runId));
  assert.equal(replay.nextCursor, pages[1].nextCursor);

  const exhaustedUrl = new URL(researchEndpoint);
  exhaustedUrl.searchParams.set("limit", "2");
  exhaustedUrl.searchParams.set("cursor", pages[1].nextCursor);
  const exhaustedPage = await (await getResearch({ request: new Request(exhaustedUrl), env })).json();
  assert.equal(exhaustedPage.nextCursor, null);
});

test("research feed rejects malformed, duplicate, and unknown cursor parameters", async () => {
  const database = new MemoryResearchDatabase();
  await addStoredResearch(database, "2026-08-31T02:00:00.000Z");
  const env = { APC_CONTENT_OS_DB: database };
  const encode = value => btoa(JSON.stringify(value))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const invalidQueries = [
    "?cursor=",
    "?cursor=not-a-cursor",
    `?cursor=${"x".repeat(257)}`,
    `?cursor=${encode({ generatedAt: "2026-08-31T02:00:00.000Z", runId: "wrong" })}`,
    `?cursor=${encode({ generatedAt: "2026-02-31T02:00:00.000Z", runId: "apc-weekly-topic-review:2026-W09" })}`,
    `?cursor=${encode({ generatedAt: "2026-08-31T02:00:00.000Z", runId: weeklyRunId("2026-08-31T02:00:00.000Z"), extra: true })}`,
    "?cursor=abc&cursor=def",
    "?limit=2&limit=3",
    "?limit=01",
    "?limit=0",
    "?limit=53",
    "?unknown=value",
  ];
  for (const query of invalidQueries) {
    const response = await getResearch({ request: new Request(researchEndpoint + query), env });
    assert.equal(response.status, 400, query);
  }
});

function decisionRequest(body, extraHeaders = {}, endpoint = researchEndpoint) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "X-APC-Content-OS": "1",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

test("research decisions use exact schema and idempotent request IDs", async () => {
  const database = new MemoryResearchDatabase();
  const itemId = "apc-weekly-topic-review:2026-W36|topic:weekly_01";
  database.items.add(itemId);
  const env = { APC_CONTENT_OS_DB: database };
  const requestId = "11111111-1111-4111-8111-111111111111";
  const body = { itemId, decision: "archive", requestId };

  const recorded = await decideResearch({ request: decisionRequest(body), env });
  assert.equal(recorded.status, 200);
  assert.deepEqual(await recorded.json(), {
    status: "recorded",
    itemId,
    decision: "archived",
    decidedAt: database.decisions.get(requestId).decided_at,
    requestId,
  });

  const duplicate = await decideResearch({ request: decisionRequest(body), env });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).status, "duplicate");
  assert.equal(database.decisions.size, 1);

  const conflictingReuse = await decideResearch({
    request: decisionRequest({ itemId, decision: "used", requestId }),
    env,
  });
  assert.equal(conflictingReuse.status, 409);
  assert.equal(database.decisions.size, 1);
});

test("research decision endpoint rejects cross-origin, unknown, and oversized writes", async () => {
  const database = new MemoryResearchDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const body = {
    itemId: "apc-weekly-topic-review:2026-W36|topic:weekly_01",
    decision: "used",
    requestId: "11111111-1111-4111-8111-111111111111",
  };

  const crossOrigin = await decideResearch({
    request: decisionRequest(body, { Origin: "https://attacker.example" }),
    env,
  });
  assert.equal(crossOrigin.status, 403);

  for (const endpoint of [`${researchEndpoint}?decision=used`, `${researchEndpoint}?`]) {
    const queryString = await decideResearch({
      request: decisionRequest(body, {}, endpoint),
      env,
    });
    assert.equal(queryString.status, 400, endpoint);
  }

  for (const contentType of ["application/json-patch+json", "application/jsonp", "text/application/json"]) {
    const wrongType = await decideResearch({
      request: decisionRequest(body, { "Content-Type": contentType }),
      env,
    });
    assert.equal(wrongType.status, 415, contentType);
  }

  const wrongLength = await decideResearch({
    request: decisionRequest(body, { "Content-Length": "1" }),
    env,
  });
  assert.equal(wrongLength.status, 400);

  const invalidLength = await decideResearch({
    request: decisionRequest(body, { "Content-Length": "1e3" }),
    env,
  });
  assert.equal(invalidLength.status, 400);

  const unexpected = await decideResearch({
    request: decisionRequest({ ...body, autoApprove: true }),
    env,
  });
  assert.equal(unexpected.status, 400);

  const oversized = await decideResearch({
    request: decisionRequest({ ...body, itemId: "x".repeat(9 * 1024) }),
    env,
  });
  assert.equal(oversized.status, 413);
  assert.equal(database.decisions.size, 0);
});

test("empty research feed is bounded and rejects invalid limits", async () => {
  const database = new MemoryResearchDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const response = await getResearch({ request: new Request(researchEndpoint), env });
  assert.equal(response.status, 200);
  const body = await response.json();
  assertResearchPageContract(body);
  assert.deepEqual(body.runs, []);
  assert.deepEqual(body.items, []);
  assert.equal(body.nextCursor, null);

  const invalid = await getResearch({ request: new Request(`${researchEndpoint}?limit=100`), env });
  assert.equal(invalid.status, 400);
});
