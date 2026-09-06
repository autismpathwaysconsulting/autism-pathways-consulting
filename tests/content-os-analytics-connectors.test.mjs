import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { onRequest as authorize } from "../functions/_middleware.js";
import { forwardAnalyticsConnector } from "../functions/lib/content-os/analytics-connector-proxy.js";
import { assertValidAnalyticsSnapshot } from "../content-os/analytics.js";
import { onRequestGet as getConnections } from "../functions/api/content-os/connections/index.js";
import { onRequestPost as ingestGithubAnalytics } from "../functions/api/content-os/ingest/analytics-github.js";

async function signGithubBody(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

test("only exact OAuth callback GETs bypass the dashboard session", async () => {
  const accepted = await authorize({
    env: {},
    request: new Request("https://example.com/api/content-os/connections/meta/callback?state=safe&code=safe"),
    next: () => new Response("callback"),
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "callback");

  const rejected = await authorize({
    env: {},
    request: new Request("https://example.com/api/content-os/connections/meta/callback/extra"),
    next: () => new Response("private"),
  });
  assert.equal(rejected.status, 503);
});

test("only the exact automatic analytics ingest POST bypasses the dashboard session", async () => {
  const accepted = await authorize({
    env: {},
    request: new Request("https://example.com/api/content-os/ingest/analytics-github", { method: "POST" }),
    next: () => new Response("automatic analytics"),
  });
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), "automatic analytics");

  const rejected = await authorize({
    env: {},
    request: new Request("https://example.com/api/content-os/ingest/analytics-github/extra", { method: "POST" }),
    next: () => new Response("private"),
  });
  assert.equal(rejected.status, 503);
});

test("automatic analytics ingest fails closed without its private secret", async () => {
  const response = await ingestGithubAnalytics({
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
    },
    request: new Request("https://example.com/api/content-os/ingest/analytics-github", { method: "POST" }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "not_configured");
});

test("automatic analytics ingest authenticates an empty checkpoint heartbeat", async () => {
  const secret = "test-only-analytics-secret";
  const body = JSON.stringify({
    schemaVersion: "apc.analytics-github.v1",
    deliveryId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    records: [],
  });
  const response = await ingestGithubAnalytics({
    env: {
      APC_CONTENT_OS_AUTOMATION_ENABLED: "true",
      APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true",
      APC_CONTENT_OS_ANALYTICS_INGEST_SECRET: secret,
      APC_CONTENT_OS_DB: {},
    },
    request: new Request("https://example.com/api/content-os/ingest/analytics-github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APC-Source": "apc-ai-os-meta-insights",
        "X-Hub-Signature-256": await signGithubBody(secret, body),
      },
      body,
    }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    schemaVersion: "apc.analytics-github.v1",
    status: "accepted",
    deliveryId: JSON.parse(body).deliveryId,
    accepted: 0,
    duplicates: 0,
  });
});

test("Pages forwards connector traffic through a service binding and protects writes", async () => {
  const calls = [];
  const connector = { fetch: async request => { calls.push(request.url); return Response.json({ ok: true }); } };
  const read = await forwardAnalyticsConnector({
    env: { APC_ANALYTICS_CONNECTOR: connector },
    request: new Request("https://example.com/api/content-os/connections"),
  });
  assert.equal(read.status, 200);
  assert.deepEqual(calls, ["https://example.com/api/content-os/connections"]);

  const denied = await forwardAnalyticsConnector({
    env: { APC_ANALYTICS_CONNECTOR: connector },
    request: new Request("https://example.com/api/content-os/publications", { method: "POST" }),
  }, { write: true });
  assert.equal(denied.status, 403);
  assert.equal(calls.length, 1);
});

test("the external Meta feed remains available when the direct connector is absent", async () => {
  const available = await getConnections({
    env: { APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED: "true" },
    request: new Request("https://example.com/api/content-os/connections"),
  });
  assert.equal(available.status, 200);
  assert.deepEqual(await available.json(), {
    configuredProviders: {},
    connections: [],
    ingestionEnabled: false,
    enabledProviders: [],
    externalProviders: { meta: true },
  });

  const unavailable = await getConnections({
    env: {},
    request: new Request("https://example.com/api/content-os/connections"),
  });
  assert.equal(unavailable.status, 503);
});

test("connector snapshots use provider-specific collection methods", () => {
  const base = {
    schemaVersion: "apc.analytics.v1",
    snapshotId: "snap_connector-12345678",
    publicationId: "pub_connector-12345678",
    checkpoint: "24h",
    protocolVersion: "APC-META-2026-09",
    capturedAt: "2026-09-05T02:00:00.000Z",
    metrics: { views: 1, reach: null, averageWatchTimeSeconds: null, totalWatchTimeSeconds: null, likes: 1, commentsCount: 0, saves: null, shares: 0 },
    missingReasons: { views: null, reach: "not_shown_in_source", averageWatchTimeSeconds: "not_shown_in_source", totalWatchTimeSeconds: "not_shown_in_source", likes: null, commentsCount: null, saves: "not_shown_in_source", shares: null },
    signals: { substantiveCommentsCount: null, dmProblemCount: null, requestCount: null, interestCount: null, paidCount: null },
    deidentifiedThemeSummary: "",
    collectionMethod: "tiktok_connector",
    sourceSystem: "TikTok Analytics",
    sourceMetricVersion: "tiktok-display-v2",
  };
  assert.doesNotThrow(() => assertValidAnalyticsSnapshot(base));
  assert.doesNotThrow(() => assertValidAnalyticsSnapshot({ ...base, collectionMethod: "youtube_connector", sourceSystem: "YouTube Studio" }));
});

test("the dashboard offers the existing Meta feed as a synced publication path", async () => {
  const app = await readFile(new URL("../content-os/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../content-os/index.html", import.meta.url), "utf8");
  assert.match(app, /Partial setup/);
  assert.match(app, /Connected feed/);
  assert.match(app, /Existing Meta automation/);
  assert.match(app, /supplies its episode mapping from Content OS automatically/);
  assert.match(html, /existing Meta feed now reads new episode mappings directly from Content OS/);
  assert.match(html, /id="trackPublicationButton"[^>]+disabled/);
});

test("connector migration and configs define the secure scheduled architecture", async () => {
  const [migration, workerConfig, pagesConfig] = await Promise.all([
    readFile(new URL("../migrations/0004_analytics_connectors.sql", import.meta.url), "utf8"),
    readFile(new URL("../automation-worker/wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  for (const table of ["content_analytics_connections", "content_oauth_states", "content_analytics_publication_links", "content_analytics_checkpoint_jobs", "content_analytics_ingestion_runs"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(workerConfig, /"crons": \["\*\/30 \* \* \* \*"\]/);
  assert.match(workerConfig, /"workers_dev": false/);
  assert.match(workerConfig, /"APC_CONNECTOR_DATA_KEY_V1"/);
  assert.match(pagesConfig, /"binding": "APC_ANALYTICS_CONNECTOR"/);
  assert.match(pagesConfig, /"service": "apc-content-os-analytics-ingestor"/);
  assert.match(pagesConfig, /"APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED": "true"/);
});
