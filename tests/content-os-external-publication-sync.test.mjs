import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { onRequest as authorize } from "../functions/_middleware.js";
import { onRequestPost as registerExternalPublication } from "../functions/api/content-os/publications/external.js";
import { onRequestGet as exportPublicationMappings } from "../functions/api/content-os/export/publication-mappings.js";

const endpoint = "https://example.com/api/content-os/publications/external";
const exportEndpoint = "https://example.com/api/content-os/export/publication-mappings";

function publication(overrides = {}) {
  return {
    schemaVersion: "apc.analytics.v1",
    publicationId: "pub_external-meta-12345678",
    episodeId: "EP01",
    platform: "Instagram",
    postRef: "https://www.instagram.com/reel/example/",
    publishedAt: "2026-09-06T08:00:00.000Z",
    title: "Anxiety can look like refusal",
    topic: "Anxiety can look like refusal",
    problemArea: "Teen anxiety",
    productFamily: "Understand the Behaviour",
    format: "Reel",
    durationSeconds: null,
    slideCount: null,
    hookType: "Future worry",
    creativeVersion: "pack-v1",
    ctaType: "save_share_comment",
    experimentType: "Replication post",
    ...overrides,
  };
}

class Statement {
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
    if (/FROM episode_events/.test(this.sql)) return this.database.events.get(this.params[0]) || null;
    if (/FROM episodes WHERE id = \?/.test(this.sql)) return this.params[0] === this.database.episode.id ? { ...this.database.episode } : null;
    if (/FROM content_publications/.test(this.sql)) {
      return [...this.database.publications.values()].find(row =>
        row.publication_id === this.params[0] || (row.platform === this.params[1] && row.post_ref === this.params[2])) || null;
    }
    throw new Error(`Unhandled first query: ${this.sql}`);
  }

  async all() {
    if (/FROM content_publications/.test(this.sql)) return { results: [...this.database.publications.values()] };
    throw new Error(`Unhandled all query: ${this.sql}`);
  }

  async run() {
    if (/INSERT INTO content_publications/.test(this.sql)) {
      const [publicationId, platform, postRef, publishedAt, createdAt, payloadHash, publicationJson] = this.params;
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
    if (/INSERT INTO episode_events/.test(this.sql)) {
      const [, episodeId, idempotencyKey, payloadHash, metadataJson, createdAt] = this.params;
      this.database.events.set(idempotencyKey, {
        episode_id: episodeId,
        payload_sha256: payloadHash,
        metadata_json: metadataJson,
        created_at: createdAt,
      });
      return { meta: { changes: 1 } };
    }
    if (/UPDATE episodes SET status = 'PUBLISHED'/.test(this.sql)) {
      this.database.episode.status = "PUBLISHED";
      this.database.episode.updated_at = this.params[0];
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run query: ${this.sql}`);
  }
}

class MemoryDatabase {
  constructor(status = "READY") {
    this.episode = { id: "EP01", status, archived_at: null, updated_at: "2026-09-06T07:00:00.000Z" };
    this.publications = new Map();
    this.events = new Map();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

function requestBody(value) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "X-APC-Content-OS": "1",
    },
    body: JSON.stringify(value),
  });
}

async function signedExportRequest(secret, timestamp = new Date().toISOString()) {
  const signed = `GET\n/api/content-os/export/publication-mappings\n${timestamp}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)));
  const signature = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return new Request(exportEndpoint, {
    headers: {
      "X-APC-Source": "apc-ai-os-meta-insights",
      "X-APC-Timestamp": timestamp,
      "X-APC-Signature-256": `sha256=${signature}`,
    },
  });
}

test("only the exact signed publication mapping export bypasses the dashboard session", async () => {
  const accepted = await authorize({
    env: {},
    request: new Request(exportEndpoint),
    next: () => new Response("mapping export"),
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "mapping export");

  const rejected = await authorize({
    env: {},
    request: new Request(`${exportEndpoint}/extra`),
    next: () => new Response("private"),
  });
  assert.equal(rejected.status, 503);
});

test("a READY episode is published and registered once for the existing Meta feed", async () => {
  const database = new MemoryDatabase();
  const payload = { idempotencyKey: "publication:pub_external-meta-12345678", publication: publication() };
  const env = {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
    APC_CONTENT_OS_DB: database,
  };
  const first = await registerExternalPublication({ request: requestBody(payload), env });
  assert.equal(first.status, 201);
  assert.equal((await first.json()).trackingMode, "meta_github_sync");
  assert.equal(database.episode.status, "PUBLISHED");
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);

  const replay = await registerExternalPublication({ request: requestBody(payload), env });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).idempotent, true);
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);
});

test("a concurrent identical registration resolves as an idempotent replay", async () => {
  const database = new MemoryDatabase();
  const regularBatch = database.batch.bind(database);
  database.batch = async statements => {
    await regularBatch(statements);
    throw new Error("simulated unique race after the winning transaction");
  };
  const response = await registerExternalPublication({
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
      APC_CONTENT_OS_DB: database,
    },
    request: requestBody({
      idempotencyKey: "publication:pub_external-meta-12345678",
      publication: publication(),
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).idempotent, true);
});

test("external registration rejects an episode that has not passed final review", async () => {
  const response = await registerExternalPublication({
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
      APC_CONTENT_OS_DB: new MemoryDatabase("REVIEW"),
    },
    request: requestBody({ idempotencyKey: "publication:pub_external-meta-12345678", publication: publication() }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "episode_not_ready");
});

test("the existing collector route rejects unsupported Facebook publications", async () => {
  const response = await registerExternalPublication({
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
      APC_CONTENT_OS_DB: new MemoryDatabase(),
    },
    request: requestBody({
      idempotencyKey: "publication:pub_external-meta-12345678",
      publication: publication({ platform: "Facebook" }),
    }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "unsupported_platform");
});

test("the signed export returns only canonical Meta mappings", async () => {
  const secret = "test-only-shared-secret";
  const database = new MemoryDatabase();
  const env = {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
    APC_CONTENT_OS_ANALYTICS_INGEST_SECRET: secret,
    APC_CONTENT_OS_DB: database,
  };
  const registration = await registerExternalPublication({
    env,
    request: requestBody({ idempotencyKey: "publication:pub_external-meta-12345678", publication: publication() }),
  });
  assert.equal(registration.status, 201);

  const denied = await exportPublicationMappings({ request: new Request(exportEndpoint), env });
  assert.equal(denied.status, 403);

  const exported = await exportPublicationMappings({ request: await signedExportRequest(secret), env });
  assert.equal(exported.status, 200);
  const body = await exported.json();
  assert.equal(body.schemaVersion, "apc.publication-mappings.v1");
  assert.equal(body.source, "content-os-d1");
  assert.equal(body.mappings.length, 1);
  assert.equal(body.mappings[0].episodeId, "EP01");
  assert.equal(body.mappings[0].postRef, publication().postRef);
});

test("the mapping export is limited to explicitly linked, active PUBLISHED episodes", async () => {
  const source = await readFile(new URL("../functions/api/content-os/export/publication-mappings.js", import.meta.url), "utf8");
  assert.match(source, /e\.status = 'PUBLISHED'/);
  assert.match(source, /p\.platform = 'Instagram'/);
  assert.match(source, /e\.archived_at IS NULL/);
  assert.match(source, /event\.event_type = 'PUBLICATION_LINKED'/);
  assert.match(source, /trackingMode'\) = 'meta_github_sync'/);
  assert.match(source, /LIMIT 500/);
});
