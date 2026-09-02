import test from "node:test";
import assert from "node:assert/strict";

import {
  onRequest as analyticsRoute,
  onRequestGet,
  onRequestPost,
} from "../functions/api/content-os/analytics.js";
import {
  ANALYTICS_METRICS,
  ANALYTICS_PROTOCOL_VERSION,
  ANALYTICS_SCHEMA_VERSION,
} from "../content-os/analytics.js";

const endpoint = "https://example.com/api/content-os/analytics";
const stablePublishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function publication(overrides = {}) {
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    publicationId: "pub_apc-episode-09",
    episodeId: "EP09",
    platform: "Instagram",
    postRef: "https://www.instagram.com/reel/valid123/",
    publishedAt: stablePublishedAt,
    title: "Starting is a separate demand",
    topic: "Homework initiation",
    problemArea: "Task initiation",
    productFamily: "Make School & Learning Work",
    format: "Reel",
    durationSeconds: 42,
    slideCount: null,
    hookType: "Contradiction",
    creativeVersion: "EP09-v1",
    ctaType: "save",
    experimentType: "Discovery post",
    ...overrides,
  };
}

function analyticsSnapshot(overrides = {}) {
  const metrics = {
    views: 1_000,
    reach: 800,
    averageWatchTimeSeconds: null,
    totalWatchTimeSeconds: null,
    likes: 50,
    commentsCount: 10,
    saves: 20,
    shares: 15,
  };
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    snapshotId: "snap_apc-episode-09-24h",
    publicationId: "pub_apc-episode-09",
    checkpoint: "24h",
    protocolVersion: ANALYTICS_PROTOCOL_VERSION,
    capturedAt: new Date().toISOString(),
    metrics,
    missingReasons: Object.fromEntries(ANALYTICS_METRICS.map(key => [
      key,
      metrics[key] === null ? "not_shown_in_source" : null,
    ])),
    signals: {
      substantiveCommentsCount: 2,
      dmProblemCount: 1,
      requestCount: 0,
      interestCount: 0,
      paidCount: 0,
    },
    deidentifiedThemeSummary: "Parents recognised difficulty beginning the first visible action.",
    collectionMethod: "manual",
    sourceSystem: "Instagram Insights",
    sourceMetricVersion: "meta-ui-2026-09",
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    publication: publication(),
    snapshot: analyticsSnapshot(),
    idempotencyKey: "ig:EP09:24h:2026-09-02",
    ...overrides,
  };
}

function request(body, {
  expectedRevision = "0",
  origin = "https://example.com",
  contentType = "application/json",
  intent = "1",
  url = endpoint,
  extraHeaders = {},
} = {}) {
  const headers = {
    "Content-Type": contentType,
    "Origin": origin,
    "X-APC-Content-OS": intent,
    "X-APC-Analytics-Expected-Revision": expectedRevision,
    ...extraHeaders,
  };
  return new Request(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

function joinedRow(publicationRow, snapshotRow) {
  return {
    publication_id: publicationRow.publication_id,
    platform: publicationRow.platform,
    post_ref: publicationRow.post_ref,
    published_at: publicationRow.published_at,
    publication_json: publicationRow.publication_json,
    publication_hash: publicationRow.payload_hash,
    snapshot_publication_id: snapshotRow.publication_id,
    snapshot_json: snapshotRow.snapshot_json,
    snapshot_hash: snapshotRow.payload_hash,
    revision: snapshotRow.revision,
    created_at: snapshotRow.created_at,
    archived: snapshotRow.archived,
    snapshot_id: snapshotRow.snapshot_id,
    checkpoint: snapshotRow.checkpoint,
    captured_at: snapshotRow.captured_at,
    idempotency_key: snapshotRow.idempotency_key,
  };
}

class AnalyticsStatement {
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
    if (/WHERE s\.idempotency_key = \?/.test(this.sql)) {
      const snapshotRow = this.database.snapshots.find(row => row.idempotency_key === this.params[0]);
      if (!snapshotRow) return null;
      return joinedRow(this.database.publications.get(snapshotRow.publication_id), snapshotRow);
    }
    if (/WHERE s\.snapshot_id = \?/.test(this.sql)) {
      const snapshotRow = this.database.snapshots.find(row => row.snapshot_id === this.params[0]);
      if (!snapshotRow) return null;
      return joinedRow(this.database.publications.get(snapshotRow.publication_id), snapshotRow);
    }
    if (/FROM content_publications\s+WHERE publication_id = \? OR/.test(this.sql)) {
      const [publicationId, platform, postRef] = this.params;
      return [...this.database.publications.values()].find(row =>
        row.publication_id === publicationId || (row.platform === platform && row.post_ref === postRef)
      ) || null;
    }
    if (/SELECT COALESCE\(MAX\(revision\), 0\) AS revision/.test(this.sql)) {
      const [publicationId, checkpoint] = this.params;
      const revisions = this.database.snapshots
        .filter(row => row.publication_id === publicationId && row.checkpoint === checkpoint)
        .map(row => row.revision);
      return { revision: revisions.length ? Math.max(...revisions) : 0 };
    }
    throw new Error(`Unhandled first() query: ${this.sql}`);
  }

  async all() {
    if (/FROM content_analytics_snapshots s\s+JOIN content_publications/.test(this.sql)) {
      let bindingIndex = 0;
      let rows = this.database.snapshots.filter(row => row.archived === 0);
      if (/s\.publication_id = \?/.test(this.sql)) {
        const publicationId = this.params[bindingIndex++];
        rows = rows.filter(row => row.publication_id === publicationId);
      }
      if (/s\.checkpoint = \?/.test(this.sql)) {
        const checkpoint = this.params[bindingIndex++];
        rows = rows.filter(row => row.checkpoint === checkpoint);
      }
      if (/NOT EXISTS \(\s*SELECT 1 FROM content_analytics_snapshots newer/.test(this.sql)) {
        rows = rows.filter(row => !this.database.snapshots.some(candidate =>
          candidate.publication_id === row.publication_id &&
          candidate.checkpoint === row.checkpoint &&
          candidate.archived === 0 &&
          candidate.revision > row.revision
        ));
      }
      if (/s\.created_at < \? OR \(s\.created_at = \? AND s\.snapshot_id < \?\)/.test(this.sql)) {
        const createdAt = this.params[bindingIndex++];
        bindingIndex += 1;
        const snapshotId = this.params[bindingIndex++];
        rows = rows.filter(row => row.created_at < createdAt || (
          row.created_at === createdAt && row.snapshot_id < snapshotId
        ));
      }
      rows.sort((left, right) =>
        right.created_at.localeCompare(left.created_at) || right.snapshot_id.localeCompare(left.snapshot_id)
      );
      const limit = this.params[this.params.length - 1];
      return {
        results: rows.slice(0, limit).map(snapshotRow =>
          joinedRow(this.database.publications.get(snapshotRow.publication_id), snapshotRow)
        ),
      };
    }
    throw new Error(`Unhandled all() query: ${this.sql}`);
  }

  async run() {
    if (/DELETE FROM content_analytics_snapshots/.test(this.sql)) return { meta: { changes: 0 } };
    if (/DELETE FROM content_publications/.test(this.sql)) return { meta: { changes: 0 } };
    if (/INSERT INTO content_publications/.test(this.sql)) {
      const [publicationId, platform, postRef, publishedAt, createdAt, payloadHash, publicationJson] = this.params;
      const existingId = this.database.publications.get(publicationId);
      const existingRef = [...this.database.publications.values()].find(row => row.platform === platform && row.post_ref === postRef);
      if (existingId || existingRef) return { meta: { changes: 0 } };
      this.database.publications.set(publicationId, {
        publication_id: publicationId,
        platform,
        post_ref: postRef,
        published_at: publishedAt,
        created_at: createdAt,
        payload_hash: payloadHash,
        publication_json: publicationJson,
      });
      return { meta: { changes: 1 } };
    }
    if (/INSERT INTO content_analytics_snapshots/.test(this.sql)) {
      const [
        snapshotId, publicationId, checkpoint, revision, capturedAt, createdAt,
        payloadHash, idempotencyKey, snapshotJson, requiredPublicationId,
        requiredPublicationHash, revisionPublicationId, revisionCheckpoint, expectedRevision,
      ] = this.params;
      const publicationRow = this.database.publications.get(requiredPublicationId);
      const currentRevision = Math.max(0, ...this.database.snapshots
        .filter(row => row.publication_id === revisionPublicationId && row.checkpoint === revisionCheckpoint)
        .map(row => row.revision));
      if (!publicationRow || publicationRow.payload_hash !== requiredPublicationHash || currentRevision !== expectedRevision) {
        return { meta: { changes: 0 } };
      }
      if (this.database.snapshots.some(row => row.snapshot_id === snapshotId || row.idempotency_key === idempotencyKey)) {
        throw new Error("analytics uniqueness conflict");
      }
      this.database.snapshots.push({
        snapshot_id: snapshotId,
        publication_id: publicationId,
        checkpoint,
        revision,
        captured_at: capturedAt,
        created_at: createdAt,
        archived: 0,
        payload_hash: payloadHash,
        idempotency_key: idempotencyKey,
        snapshot_json: snapshotJson,
      });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run() query: ${this.sql}`);
  }
}

class MemoryAnalyticsDatabase {
  constructor() {
    this.publications = new Map();
    this.snapshots = [];
    this.preparedSql = [];
    this.batchCalls = 0;
  }

  prepare(sql) {
    this.preparedSql.push(sql);
    return new AnalyticsStatement(this, sql);
  }

  async batch(statements) {
    this.batchCalls += 1;
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

test("analytics write requires exact same-origin intent and revision headers", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryAnalyticsDatabase() };
  const cases = [
    [request(payload(), { intent: "0" }), 400, "missing_intent_header"],
    [request(payload(), { origin: "https://attacker.example" }), 403, "cross_origin_write"],
    [request(payload(), { contentType: "text/plain" }), 415, "unsupported_content_type"],
    [request(payload(), { expectedRevision: "-1" }), 400, "invalid_expected_revision"],
    [request(payload(), { expectedRevision: "01" }), 400, "invalid_expected_revision"],
    [request(payload(), { url: `${endpoint}?write=1` }), 400, "invalid_query"],
  ];
  for (const [candidate, status, code] of cases) {
    const response = await onRequestPost({ request: candidate, env });
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
  assert.equal(env.APC_CONTENT_OS_DB.snapshots.length, 0);
});

test("analytics rejects invalid source combinations and timestamps", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryAnalyticsDatabase() };

  const sourceMismatch = payload();
  sourceMismatch.publication.platform = "TikTok";
  const sourceResponse = await onRequestPost({ request: request(sourceMismatch), env });
  assert.equal(sourceResponse.status, 400);
  assert.equal((await sourceResponse.json()).code, "invalid_source");

  const legacyCheckpoint = payload();
  legacyCheckpoint.snapshot.checkpoint = "72h_legacy";
  const legacyResponse = await onRequestPost({ request: request(legacyCheckpoint), env });
  assert.equal(legacyResponse.status, 400);
  assert.equal((await legacyResponse.json()).code, "invalid_source");

  const future = payload();
  future.snapshot.capturedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const futureResponse = await onRequestPost({ request: request(future), env });
  assert.equal(futureResponse.status, 400);
  assert.equal((await futureResponse.json()).code, "invalid_timestamp");

  const beforePublication = payload();
  beforePublication.snapshot.capturedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const beforeResponse = await onRequestPost({ request: request(beforePublication), env });
  assert.equal(beforeResponse.status, 400);
  assert.equal((await beforeResponse.json()).code, "invalid_timestamp");

  const futurePublication = payload();
  futurePublication.publication.publishedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  futurePublication.snapshot.capturedAt = new Date(Date.now() + 4 * 60 * 1000).toISOString();
  const futurePublicationResponse = await onRequestPost({ request: request(futurePublication), env });
  assert.equal(futurePublicationResponse.status, 400);
  assert.equal((await futurePublicationResponse.json()).code, "invalid_timestamp");
});

test("analytics API rejects impossible input and cursor timestamps", async () => {
  const env = { APC_CONTENT_OS_DB: new MemoryAnalyticsDatabase() };

  const impossiblePublication = payload();
  impossiblePublication.publication.publishedAt = "2025-02-29T00:00:00.000Z";
  const publicationResponse = await onRequestPost({ request: request(impossiblePublication), env });
  assert.equal(publicationResponse.status, 400);
  assert.equal((await publicationResponse.json()).code, "invalid_schema");

  const impossibleCapture = payload();
  impossibleCapture.snapshot.capturedAt = "2026-02-31T00:00:00.000Z";
  const captureResponse = await onRequestPost({ request: request(impossibleCapture), env });
  assert.equal(captureResponse.status, 400);
  assert.equal((await captureResponse.json()).code, "invalid_schema");

  const cursor = Buffer.from(JSON.stringify({
    createdAt: "2026-02-31T00:00:00.000Z",
    snapshotId: "snap_apc-cursor-0001",
  })).toString("base64url");
  const cursorResponse = await onRequestGet({
    request: new Request(`${endpoint}?view=list&cursor=${cursor}`),
    env,
  });
  assert.equal(cursorResponse.status, 400);
  assert.equal((await cursorResponse.json()).code, "invalid_query");
});

test("analytics enforces publication time and checkpoint capture windows", async () => {
  const capturedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const cases = [
    { label: "missing publishedAt", checkpoint: "24h", elapsedHours: null },
    { label: "mislabeled 24-hour capture as 7d", checkpoint: "7d", elapsedHours: 24 },
    { label: "24h too early", checkpoint: "24h", elapsedHours: 17 },
    { label: "24h too late", checkpoint: "24h", elapsedHours: 37 },
    { label: "7d too early", checkpoint: "7d", elapsedHours: 5 * 24 },
    { label: "7d too late", checkpoint: "7d", elapsedHours: 10 * 24 },
    { label: "28d too early", checkpoint: "28d", elapsedHours: 24 * 24 },
    { label: "28d too late", checkpoint: "28d", elapsedHours: 36 * 24 },
  ];

  for (const candidate of cases) {
    const database = new MemoryAnalyticsDatabase();
    const item = payload();
    item.publication.publishedAt = candidate.elapsedHours === null
      ? null
      : new Date(Date.parse(capturedAt) - candidate.elapsedHours * 60 * 60 * 1000).toISOString();
    item.snapshot.checkpoint = candidate.checkpoint;
    item.snapshot.capturedAt = capturedAt;
    item.idempotencyKey = `ig:EP09:${candidate.checkpoint}:window-test`;
    const response = await onRequestPost({
      request: request(item),
      env: { APC_CONTENT_OS_DB: database },
    });
    assert.equal(response.status, 400, candidate.label);
    assert.equal((await response.json()).code, "invalid_timestamp", candidate.label);
    assert.equal(database.snapshots.length, 0, candidate.label);
  }
});

test("analytics accepts checkpoint window boundaries and legacy migration timing", async () => {
  const capturedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const validWindows = [
    ["24h", 18],
    ["24h", 36],
    ["7d", 6 * 24],
    ["7d", 9 * 24],
    ["28d", 25 * 24],
    ["28d", 35 * 24],
  ];

  for (const [index, [checkpoint, elapsedHours]] of validWindows.entries()) {
    const database = new MemoryAnalyticsDatabase();
    const item = payload();
    const suffix = String(index + 1).padStart(4, "0");
    item.publication.publicationId = `pub_apc-window-${suffix}`;
    item.publication.episodeId = `EP${20 + index}`;
    item.publication.postRef = `https://www.instagram.com/reel/window${suffix}/`;
    item.publication.publishedAt = new Date(
      Date.parse(capturedAt) - elapsedHours * 60 * 60 * 1000,
    ).toISOString();
    item.snapshot.snapshotId = `snap_apc-window-${suffix}`;
    item.snapshot.publicationId = item.publication.publicationId;
    item.snapshot.checkpoint = checkpoint;
    item.snapshot.capturedAt = capturedAt;
    item.idempotencyKey = `ig:${item.publication.episodeId}:${checkpoint}:boundary`;
    const response = await onRequestPost({
      request: request(item),
      env: { APC_CONTENT_OS_DB: database },
    });
    assert.equal(response.status, 201, `${checkpoint} at ${elapsedHours} hours`);
  }

  const legacyDatabase = new MemoryAnalyticsDatabase();
  const legacy = payload();
  legacy.publication.publicationId = "pub_apc-legacy-0001";
  legacy.publication.postRef = "legacy-post-0001";
  legacy.publication.publishedAt = null;
  legacy.snapshot.snapshotId = "snap_apc-legacy-0001";
  legacy.snapshot.publicationId = legacy.publication.publicationId;
  legacy.snapshot.checkpoint = "72h_legacy";
  legacy.snapshot.capturedAt = null;
  legacy.snapshot.collectionMethod = "legacy_migration";
  legacy.snapshot.sourceSystem = "Legacy Content OS";
  legacy.idempotencyKey = "legacy:EP09:72h:0001";
  const legacyResponse = await onRequestPost({
    request: request(legacy),
    env: { APC_CONTENT_OS_DB: legacyDatabase },
  });
  assert.equal(legacyResponse.status, 201);
});

test("analytics revisions append once, retry idempotently, and reject stale writes", async () => {
  const database = new MemoryAnalyticsDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const initialPayload = payload();

  const first = await onRequestPost({ request: request(initialPayload), env });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.idempotent, false);
  assert.equal(firstBody.record.revision, 1);
  assert.equal(firstBody.record.snapshot.metrics.views, 1_000);
  assert.equal(firstBody.record.snapshot.metrics.reach, 800);
  assert.equal(database.snapshots.length, 1);

  const retry = await onRequestPost({ request: request(initialPayload), env });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).idempotent, true);
  assert.equal(database.snapshots.length, 1);

  const correction = payload();
  correction.snapshot.snapshotId = "snap_apc-episode-09-correction";
  correction.snapshot.metrics.views = 1_100;
  correction.idempotencyKey = "ig:EP09:24h:correction:01";
  const corrected = await onRequestPost({
    request: request(correction, { expectedRevision: "1" }),
    env,
  });
  assert.equal(corrected.status, 201);
  assert.equal((await corrected.json()).record.revision, 2);
  assert.equal(database.snapshots.length, 2);

  const stale = payload();
  stale.snapshot.snapshotId = "snap_apc-episode-09-stale01";
  stale.idempotencyKey = "ig:EP09:24h:stale:001";
  const staleResponse = await onRequestPost({
    request: request(stale, { expectedRevision: "1" }),
    env,
  });
  assert.equal(staleResponse.status, 409);
  const staleBody = await staleResponse.json();
  assert.equal(staleBody.code, "revision_conflict");
  assert.equal(staleBody.currentRevision, 2);
  assert.equal(database.snapshots.length, 2);
  assert.ok(database.preparedSql.every(sql => !/\bDELETE FROM\b/i.test(sql)));
});

test("analytics idempotency key cannot be reused with altered data", async () => {
  const database = new MemoryAnalyticsDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const original = payload();
  assert.equal((await onRequestPost({ request: request(original), env })).status, 201);

  const altered = payload();
  altered.snapshot.metrics.saves = 99;
  const response = await onRequestPost({ request: request(altered), env });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "idempotency_key_reuse");
  assert.equal(database.snapshots.length, 1);
});

test("analytics body is stream-capped and stored hash tampering fails closed", async () => {
  const database = new MemoryAnalyticsDatabase();
  const env = { APC_CONTENT_OS_DB: database };

  const oversized = request("x".repeat(64 * 1024 + 1));
  const oversizedResponse = await onRequestPost({ request: oversized, env });
  assert.equal(oversizedResponse.status, 413);
  assert.equal((await oversizedResponse.json()).code, "body_too_large");

  const original = payload();
  assert.equal((await onRequestPost({ request: request(original), env })).status, 201);
  database.snapshots[0].payload_hash = "0".repeat(64);
  const tampered = await onRequestGet({ request: new Request(endpoint), env });
  assert.equal(tampered.status, 503);
  assert.equal((await tampered.json()).code, "database_unavailable");
  assert.equal(database.snapshots.length, 1);
});

test("analytics stored metadata corruption fails closed", async () => {
  const corruptions = [
    ["publication ID", database => { database.publications.values().next().value.publication_id = "pub_corrupt-publication"; }],
    ["platform", database => { database.publications.values().next().value.platform = "TikTok"; }],
    ["post reference", database => { database.publications.values().next().value.post_ref = "corrupt-post-ref"; }],
    ["published time", database => { database.publications.values().next().value.published_at = "2020-01-01T00:00:00.000Z"; }],
    ["snapshot ID", database => { database.snapshots[0].snapshot_id = "snap_corrupt-snapshot"; }],
    ["checkpoint", database => { database.snapshots[0].checkpoint = "7d"; }],
    ["captured time", database => { database.snapshots[0].captured_at = "2020-01-02T00:00:00.000Z"; }],
    ["impossible created time", database => { database.snapshots[0].created_at = "2026-02-31T00:00:00.000Z"; }],
    ["idempotency key", database => { database.snapshots[0].idempotency_key = "ig:EP09:24h:changed-key"; }],
  ];

  for (const [label, corrupt] of corruptions) {
    const database = new MemoryAnalyticsDatabase();
    const env = { APC_CONTENT_OS_DB: database };
    assert.equal((await onRequestPost({ request: request(payload()), env })).status, 201, label);
    corrupt(database);
    const response = await onRequestGet({ request: new Request(endpoint), env });
    assert.equal(response.status, 503, label);
    assert.equal((await response.json()).code, "database_unavailable", label);
  }
});

test("analytics catch-all rejects unsupported methods", async () => {
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await analyticsRoute({ request: new Request(endpoint, { method }) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "GET, POST");
    assert.equal((await response.json()).code, "method_not_allowed");
  }
});

test("analytics GET is read-only and advertises indefinite durable retention", async () => {
  const database = new MemoryAnalyticsDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const batchCallsBefore = database.batchCalls;
  const statementsBefore = database.preparedSql.length;
  const response = await onRequestGet({ request: new Request(endpoint), env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    view: "latest",
    records: [],
    nextCursor: null,
    retentionPolicy: "indefinite",
  });
  assert.equal(database.batchCalls, batchCallsBefore);
  assert.equal(database.publications.size, 0);
  assert.equal(database.snapshots.length, 0);
  assert.ok(database.preparedSql.slice(statementsBefore).every(sql => !/\b(?:DELETE|UPDATE|INSERT)\b/i.test(sql)));

  for (const query of ["?view=unknown", "?limit=0", "?limit=101", "?unknown=1", "?checkpoint=72h"]) {
    const invalid = await onRequestGet({ request: new Request(endpoint + query), env });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, "invalid_query");
  }
});

test("analytics accepts valid historical captures without pruning them", async () => {
  const database = new MemoryAnalyticsDatabase();
  const env = { APC_CONTENT_OS_DB: database };
  const historical = payload();
  historical.publication.publicationId = "pub_apc-history-0001";
  historical.publication.episodeId = "EP01";
  historical.publication.postRef = "https://www.instagram.com/reel/history0001/";
  historical.publication.publishedAt = "2018-01-01T00:00:00.000Z";
  historical.snapshot.snapshotId = "snap_apc-history-0001-24h";
  historical.snapshot.publicationId = historical.publication.publicationId;
  historical.snapshot.capturedAt = "2018-01-02T00:00:00.000Z";
  historical.idempotencyKey = "ig:EP01:24h:2018-01-02";

  const written = await onRequestPost({ request: request(historical), env });
  assert.equal(written.status, 201);
  assert.equal(database.snapshots.length, 1);
  assert.ok(database.preparedSql.every(sql => !/\bDELETE FROM\b/i.test(sql)));

  const read = await onRequestGet({ request: new Request(`${endpoint}?view=list&limit=1`), env });
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.records.length, 1);
  assert.equal(body.records[0].snapshot.capturedAt, historical.snapshot.capturedAt);
  assert.equal(body.retentionPolicy, "indefinite");
  assert.equal(database.snapshots.length, 1);
});

test("analytics GET remains cursor-paginated and bounded", async () => {
  const database = new MemoryAnalyticsDatabase();
  const env = { APC_CONTENT_OS_DB: database };

  for (const [index, episodeId] of [[1, "EP11"], [2, "EP12"], [3, "EP13"]]) {
    const item = payload();
    item.publication.publicationId = `pub_apc-page-000${index}`;
    item.publication.episodeId = episodeId;
    item.publication.postRef = `https://www.instagram.com/reel/page000${index}/`;
    item.snapshot.snapshotId = `snap_apc-page-000${index}-24h`;
    item.snapshot.publicationId = item.publication.publicationId;
    item.idempotencyKey = `ig:${episodeId}:24h:page:${index}`;
    assert.equal((await onRequestPost({ request: request(item), env })).status, 201);
  }

  const firstResponse = await onRequestGet({
    request: new Request(`${endpoint}?view=list&limit=2`),
    env,
  });
  assert.equal(firstResponse.status, 200);
  const firstPage = await firstResponse.json();
  assert.equal(firstPage.records.length, 2);
  assert.equal(typeof firstPage.nextCursor, "string");
  assert.equal(firstPage.retentionPolicy, "indefinite");

  const secondResponse = await onRequestGet({
    request: new Request(`${endpoint}?view=list&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`),
    env,
  });
  assert.equal(secondResponse.status, 200);
  const secondPage = await secondResponse.json();
  assert.equal(secondPage.records.length, 1);
  assert.equal(secondPage.nextCursor, null);
  const snapshotIds = [...firstPage.records, ...secondPage.records].map(record => record.snapshot.snapshotId);
  assert.equal(new Set(snapshotIds).size, 3);

  const readQueries = database.preparedSql.filter(sql => /ORDER BY s\.created_at DESC, s\.snapshot_id DESC/.test(sql));
  assert.equal(readQueries.length, 2);
  assert.ok(readQueries.every(sql => /LIMIT \?/.test(sql)));
  assert.ok(database.preparedSql.every(sql => !/\bDELETE FROM\b/i.test(sql)));
});
