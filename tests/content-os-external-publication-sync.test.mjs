import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { onRequest as authorize } from "../functions/_middleware.js";
import { onRequestPost as registerExternalPublication } from "../functions/api/content-os/publications/external.js";
import { onRequestGet as exportPublicationMappings } from "../functions/api/content-os/export/publication-mappings.js";
import {
  canonicalInstagramReelPostRef,
  canonicalInstagramReelPublicationId,
} from "../content-os/instagram-reels.js";

const endpoint = "https://example.com/api/content-os/publications/external";
const exportEndpoint = "https://example.com/api/content-os/export/publication-mappings";
const canonicalPublicationId = "pub_465825a7d26203305da2134bba34e043";

function publication(overrides = {}) {
  return {
    schemaVersion: "apc.analytics.v1",
    publicationId: canonicalPublicationId,
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
    if (/FROM content_publications/.test(this.sql)) {
      return {
        results: [...this.database.publications.values()].filter(row => {
          const stored = JSON.parse(row.publication_json);
          return stored.episodeId === this.database.episode.id &&
            this.database.episode.status === "PUBLISHED" && !this.database.episode.archived_at;
        }),
      };
    }
    throw new Error(`Unhandled all query: ${this.sql}`);
  }

  async run() {
    if (/INSERT INTO content_publications/.test(this.sql)) {
      const [publicationId, platform, postRef, publishedAt, createdAt, payloadHash, publicationJson, episodeId] = this.params;
      if (!this.database.isEligible(episodeId)) return { meta: { changes: 0 } };
      if (this.database.publications.has(publicationId) || [...this.database.publications.values()].some(row =>
        row.platform === platform && row.post_ref === postRef)) throw new Error("UNIQUE constraint failed: content_publications");
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
      const [, idempotencyKey, payloadHash, metadataJson, createdAt, episodeId] = this.params;
      if (!this.database.isEligible(episodeId)) return { meta: { changes: 0 } };
      if (this.database.events.has(idempotencyKey)) throw new Error("UNIQUE constraint failed: episode_events.idempotency_key");
      this.database.events.set(idempotencyKey, {
        episode_id: episodeId,
        payload_sha256: payloadHash,
        metadata_json: metadataJson,
        created_at: createdAt,
      });
      return { meta: { changes: 1 } };
    }
    if (/UPDATE episodes SET status = 'PUBLISHED'/.test(this.sql)) {
      if (!this.database.isEligible(this.params[1])) return { meta: { changes: 0 } };
      this.database.episode.status = "PUBLISHED";
      this.database.episode.updated_at = this.params[0];
      return { meta: { changes: 1 } };
    }
    if (/UPDATE episodes SET updated_at = updated_at/.test(this.sql)) {
      return { meta: { changes: this.database.isEligible(this.params[0]) ? 1 : 0 } };
    }
    throw new Error(`Unhandled run query: ${this.sql}`);
  }
}

class MemoryDatabase {
  constructor(status = "READY") {
    this.episode = { id: "EP01", status, archived_at: null, updated_at: "2026-09-06T07:00:00.000Z" };
    this.publications = new Map();
    this.events = new Map();
    this.queue = Promise.resolve();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  isEligible(episodeId) {
    return episodeId === this.episode.id && !this.episode.archived_at && ["READY", "PUBLISHED"].includes(this.episode.status);
  }

  serialize(work) {
    const result = this.queue.then(work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async batch(statements) {
    return this.serialize(async () => {
      if (this.beforeBatch) this.beforeBatch();
      const snapshot = {
        episode: { ...this.episode },
        publications: new Map(this.publications),
        events: new Map(this.events),
      };
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        this.episode = snapshot.episode;
        this.publications = snapshot.publications;
        this.events = snapshot.events;
        throw error;
      }
    });
  }
}

function requestBody(value, overrides = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "X-APC-Content-OS": "1",
      ...overrides.headers,
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

function enabledEnv(database) {
  return {
    APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
    APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
    APC_CONTENT_OS_DB: database,
  };
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

test("the browser route and external publication API remain authenticated", async () => {
  const env = {
    APC_CONTENT_OS_ENVIRONMENT: "production",
    APC_CONTENT_OS_AUTH: "production-secret",
    APC_CONTENT_OS_DB: new MemoryDatabase(),
  };
  for (const [url, deniedStatus] of [["https://example.com/content-os/", 302], [endpoint, 401]]) {
    const denied = await authorize({ env, request: new Request(url), next: () => new Response("private") });
    assert.equal(denied.status, deniedStatus);
    const accepted = await authorize({
      env,
      request: new Request(url, { headers: { Authorization: `Basic ${btoa("apc:production-secret")}` } }),
      next: () => new Response("private"),
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get("Cache-Control"), "private, no-store");
  }
});

test("Instagram Reel URL variants and shortcodes resolve to one canonical Content OS identity", async () => {
  const variants = [
    "example",
    "https://instagram.com/reel/example",
    "https://m.instagram.com/reel/example/?igsh=tracking-value",
    "https://www.instagram.com/reel/example/#fragment",
  ];
  for (const postRef of variants) {
    assert.equal(canonicalInstagramReelPostRef(postRef), "https://www.instagram.com/reel/example/");
    assert.equal(await canonicalInstagramReelPublicationId(postRef), canonicalPublicationId);
  }
  for (const postRef of [
    "http://www.instagram.com/reel/example/",
    "https://evil.example/reel/example/",
    "https://www.instagram.com/p/example/",
    "https://www.instagram.com/reel/example/extra",
    "four",
  ]) {
    assert.throws(() => canonicalInstagramReelPostRef(postRef), undefined, postRef);
  }
});

test("registration stores and returns the canonical Reel identity before conflict detection", async () => {
  const database = new MemoryDatabase();
  const idempotencyKey = `publication:${canonicalPublicationId}`;
  const first = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({
      idempotencyKey,
      publication: publication({
        publicationId: "pub_noncanonical-12345678",
        postRef: "https://m.instagram.com/reel/example/?igsh=tracking-value",
      }),
    }),
  });
  assert.equal(first.status, 201);
  assert.equal((await first.json()).publicationId, canonicalPublicationId);
  assert.equal(database.publications.get(canonicalPublicationId).post_ref, "https://www.instagram.com/reel/example/");

  const replay = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({
      idempotencyKey,
      publication: publication({ postRef: "example" }),
    }),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).idempotent, true);
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);
});

test("a READY episode is published and registered once for the existing Meta feed", async () => {
  const database = new MemoryDatabase();
  const payload = { idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() };
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

test("simultaneous identical requests produce one registration and one exact idempotent replay", async () => {
  const database = new MemoryDatabase();
  const payload = { idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() };
  const responses = await Promise.all([
    registerExternalPublication({ env: enabledEnv(database), request: requestBody(payload) }),
    registerExternalPublication({ env: enabledEnv(database), request: requestBody(payload) }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(bodies.filter(body => body.idempotent === true).length, 1);
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);
});

test("simultaneous altered requests produce one winner and one deterministic conflict", async () => {
  const database = new MemoryDatabase();
  const responses = await Promise.all([
    registerExternalPublication({
      env: enabledEnv(database),
      request: requestBody({ idempotencyKey: `${canonicalPublicationId}:first`, publication: publication() }),
    }),
    registerExternalPublication({
      env: enabledEnv(database),
      request: requestBody({
        idempotencyKey: `${canonicalPublicationId}:second`,
        publication: publication({ title: "Concurrent altered title" }),
      }),
    }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const conflict = responses.find(response => response.status === 409);
  assert.equal((await conflict.json()).code, "publication_conflict");
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);
});

test("an archive racing registration fails closed inside the atomic batch", async () => {
  const database = new MemoryDatabase();
  database.beforeBatch = () => {
    database.episode.archived_at = "2026-09-06T08:01:00.000Z";
  };
  const response = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({ idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "episode_archived");
  assert.equal(database.publications.size, 0);
  assert.equal(database.events.size, 0);
});

test("a non-ready status racing registration fails closed inside the atomic batch", async () => {
  const database = new MemoryDatabase();
  database.beforeBatch = () => {
    database.episode.status = "REVIEW";
  };
  const response = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({ idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "episode_not_ready");
  assert.equal(database.publications.size, 0);
  assert.equal(database.events.size, 0);
});

test("idempotent replay fails closed after its episode is archived", async () => {
  const database = new MemoryDatabase();
  const payload = { idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() };
  const first = await registerExternalPublication({ env: enabledEnv(database), request: requestBody(payload) });
  assert.equal(first.status, 201);
  database.episode.archived_at = "2026-09-06T08:02:00.000Z";

  const replay = await registerExternalPublication({ env: enabledEnv(database), request: requestBody(payload) });
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).code, "episode_archived");
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);
});

test("altered retries return stable conflict codes without overwriting canonical data", async () => {
  const database = new MemoryDatabase();
  const idempotencyKey = `publication:${canonicalPublicationId}`;
  const first = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({ idempotencyKey, publication: publication() }),
  });
  assert.equal(first.status, 201);

  const idempotencyConflict = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({ idempotencyKey, publication: publication({ title: "Altered title" }) }),
  });
  assert.equal(idempotencyConflict.status, 409);
  assert.equal((await idempotencyConflict.json()).code, "idempotency_conflict");

  const publicationConflict = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({ idempotencyKey: `${idempotencyKey}:altered`, publication: publication({ title: "Altered title" }) }),
  });
  assert.equal(publicationConflict.status, 409);
  assert.equal((await publicationConflict.json()).code, "publication_conflict");
  assert.equal(JSON.parse(database.publications.get(canonicalPublicationId).publication_json).title, publication().title);
  assert.equal(database.events.size, 1);
});

test("one Reel cannot be attached to another episode through a URL spelling variant", async () => {
  const database = new MemoryDatabase();
  const first = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({ idempotencyKey: `${canonicalPublicationId}:episode-one`, publication: publication() }),
  });
  assert.equal(first.status, 201);

  const conflict = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody({
      idempotencyKey: `${canonicalPublicationId}:episode-two`,
      publication: publication({
        episodeId: "EP02",
        postRef: "https://instagram.com/reel/example?igsh=variant#fragment",
      }),
    }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "publication_conflict");
  assert.equal(database.publications.size, 1);
  assert.equal(database.events.size, 1);
});

test("external registration rejects cross-origin writes and unsupported Reel references", async () => {
  const database = new MemoryDatabase();
  const crossOrigin = await registerExternalPublication({
    env: enabledEnv(database),
    request: requestBody(
      { idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() },
      { headers: { Origin: "https://attacker.example" } },
    ),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "cross_origin_write");

  for (const [postRef, expectedCode] of [
    ["http://www.instagram.com/reel/example/", "invalid_publication"],
    ["https://evil.example/reel/example/", "invalid_instagram_reel"],
    ["https://www.instagram.com/p/example/", "invalid_instagram_reel"],
  ]) {
    const response = await registerExternalPublication({
      env: enabledEnv(database),
      request: requestBody({
        idempotencyKey: `publication:${canonicalPublicationId}`,
        publication: publication({ postRef }),
      }),
    });
    assert.equal(response.status, 400, postRef);
    assert.equal((await response.json()).code, expectedCode, postRef);
  }
  assert.equal(database.publications.size, 0);
  assert.equal(database.events.size, 0);
});

test("external registration rejects an episode that has not passed final review", async () => {
  const response = await registerExternalPublication({
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
      APC_CONTENT_OS_DB: new MemoryDatabase("REVIEW"),
    },
    request: requestBody({ idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() }),
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
    request: requestBody({ idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() }),
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

test("the mapping export behavior excludes archived and non-PUBLISHED episodes", async () => {
  const secret = "test-only-shared-secret";
  const database = new MemoryDatabase();
  const env = {
    ...enabledEnv(database),
    APC_CONTENT_OS_ANALYTICS_INGEST_SECRET: secret,
  };
  const registration = await registerExternalPublication({
    env,
    request: requestBody({ idempotencyKey: `publication:${canonicalPublicationId}`, publication: publication() }),
  });
  assert.equal(registration.status, 201);

  database.episode.status = "READY";
  let exported = await exportPublicationMappings({ request: await signedExportRequest(secret), env });
  assert.equal((await exported.json()).mappings.length, 0);

  database.episode.status = "PUBLISHED";
  database.episode.archived_at = "2026-09-06T09:00:00.000Z";
  exported = await exportPublicationMappings({ request: await signedExportRequest(secret), env });
  assert.equal((await exported.json()).mappings.length, 0);
});
