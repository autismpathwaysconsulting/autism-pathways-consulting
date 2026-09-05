import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { onRequest as authorize } from "../functions/_middleware.js";
import { forwardAnalyticsConnector } from "../functions/lib/content-os/analytics-connector-proxy.js";
import { assertValidAnalyticsSnapshot } from "../content-os/analytics.js";

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
});
