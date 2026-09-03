import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

async function textFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Content OS HTML uses external CSS and module JavaScript only", async () => {
  const html = await textFile("content-os/index.html");
  assert.match(html, /<link\b[^>]*href=["'](?:\/content-os\/|\.\/)?app\.css["'][^>]*>/i);
  assert.match(html, /<script\b[^>]*type=["']module["'][^>]*src=["'](?:\/content-os\/|\.\/)?app\.js["'][^>]*><\/script>/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i);
});

test("Content OS source has no inline event or style attributes", async () => {
  const html = await textFile("content-os/index.html");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /javascript\s*:/i);
});

test("private-route CSP disallows inline scripts, event handlers, and inline styles", async () => {
  const middleware = await textFile("functions/_middleware.js");
  assert.doesNotMatch(middleware, /unsafe-inline/);
  assert.match(middleware, /script-src 'self'/);
  assert.match(middleware, /script-src-attr 'none'/);
  assert.match(middleware, /style-src 'self'/);
  assert.match(middleware, /style-src-attr 'none'/);
  assert.match(middleware, /object-src 'none'/);
  assert.match(middleware, /frame-ancestors 'none'/);
  assert.match(middleware, /base-uri 'none'/);
});

test("preview cannot share the production D1 database", async () => {
  const config = JSON.parse(await textFile("wrangler.jsonc"));
  const production = config.env?.production;
  const preview = config.env?.preview;
  assert.equal(production?.vars?.APC_CONTENT_OS_ENVIRONMENT, "production");
  assert.equal(preview?.vars?.APC_CONTENT_OS_ENVIRONMENT, "preview");
  assert.equal(production?.vars?.APC_CONTENT_OS_PREVIEW_AUTH_ENABLED, "false");
  assert.equal(preview?.vars?.APC_CONTENT_OS_AUTOMATION_ENABLED, "false");
  assert.equal(production?.d1_databases?.length, 1);

  const productionId = production.d1_databases[0].database_id;
  const productionName = production.d1_databases[0].database_name;
  assert.ok(productionId);
  assert.ok(productionName);

  for (const binding of preview?.d1_databases || []) {
    assert.notEqual(binding.database_id, productionId);
    assert.notEqual(binding.database_name, productionName);
  }
  for (const binding of config.d1_databases || []) {
    assert.notEqual(binding.database_id, productionId, "default/local config must not silently bind production D1");
  }
});

test("production alone enables the bounded automation feed", async () => {
  const config = JSON.parse(await textFile("wrangler.jsonc"));
  const production = config.env.production;
  assert.equal(production.vars.APC_CONTENT_OS_AUTOMATION_ENABLED, "true");
  assert.equal(config.vars.APC_CONTENT_OS_AUTOMATION_ENABLED, "false");
  assert.equal(config.env.preview.vars.APC_CONTENT_OS_AUTOMATION_ENABLED, "false");
  assert.deepEqual(production.kv_namespaces || [], []);
  assert.doesNotMatch(JSON.stringify(config), /WEBHOOK_SECRET|github_pat_|ghp_[A-Za-z0-9]/i);
});

test("hardening migration defines append-only revision and ingestion records", async () => {
  const sql = await textFile("migrations/0002_content_os_v23_hardening.sql");
  for (const table of [
    "content_os_revisions",
    "content_publications",
    "content_analytics_snapshots",
    "automation_deliveries",
    "research_runs",
    "research_items",
    "research_decisions",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
  }
  for (const table of [
    "content_os_revisions",
    "content_publications",
    "content_analytics_snapshots",
    "automation_deliveries",
    "research_runs",
    "research_items",
    "research_decisions",
  ]) {
    assert.match(sql, new RegExp(`BEFORE UPDATE ON ${table}\\b`, "i"));
    assert.match(sql, new RegExp(`BEFORE DELETE ON ${table}\\b`, "i"));
  }
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/i);
  assert.match(sql, /UNIQUE\s*\(publication_id, checkpoint, revision\)/i);
  assert.match(sql, /ALTER TABLE content_os_state ADD COLUMN restored_from_revision INTEGER/i);
  assert.match(sql, /restored_from_revision, state_hash, state_json/i);
  assert.match(sql, /NEW\.restored_from_revision/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_content_os_revisions_request_id[\s\S]*WHERE request_id IS NOT NULL/i);
});

test("hardening migration preserves legacy updates and revision audit guarantees", async () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec(await textFile("migrations/0001_content_os_state.sql"));
    database.exec(await textFile("migrations/0002_content_os_v23_hardening.sql"));

    const legacyState = JSON.stringify({ schemaVersion: "2.2", state: { topics: [] } });
    database.prepare(`
      UPDATE content_os_state
      SET schema_version = ?, revision = ?, updated_at = ?, state_json = ?
      WHERE id = 1
    `).run("2.2", 1, "2026-09-02T08:00:00.000Z", legacyState);

    assert.equal(
      database.prepare("SELECT revision FROM content_os_state WHERE id = 1").get().revision,
      1,
    );
    assert.deepEqual(
      { ...database.prepare(`
        SELECT revision, action, request_id, restored_from_revision, state_hash, state_json
        FROM content_os_revisions
        WHERE revision = 1
      `).get() },
      {
        revision: 1,
        action: "legacy",
        request_id: null,
        restored_from_revision: null,
        state_hash: "legacy-unhashed",
        state_json: legacyState,
      },
    );

    const currentState = JSON.stringify({ schemaVersion: "2.3", state: { topics: [] } });
    database.prepare(`
      UPDATE content_os_state
      SET schema_version = ?, revision = ?, updated_at = ?, state_json = ?,
          last_action = ?, last_request_id = ?, state_hash = ?, restored_from_revision = NULL
      WHERE id = 1
    `).run(
      "2.3",
      2,
      "2026-09-02T08:05:00.000Z",
      currentState,
      "save",
      "request-one",
      "sha256-one",
    );

    assert.throws(
      () => database.prepare(`
        UPDATE content_os_state
        SET revision = ?, updated_at = ?, state_json = ?, last_request_id = ?, state_hash = ?
        WHERE id = 1
      `).run(3, "2026-09-02T08:10:00.000Z", currentState, "request-one", "sha256-two"),
      /UNIQUE constraint failed: content_os_revisions\.request_id/,
    );
    assert.equal(
      database.prepare("SELECT revision FROM content_os_state WHERE id = 1").get().revision,
      2,
      "a duplicate request ID must roll back the canonical update",
    );

    assert.throws(
      () => database.prepare("UPDATE content_os_revisions SET action = 'tampered' WHERE revision = 1").run(),
      /content_os_revisions is append-only/,
    );
    assert.throws(
      () => database.prepare("DELETE FROM content_os_revisions WHERE revision = 1").run(),
      /content_os_revisions is append-only/,
    );

    database.prepare(`
      INSERT INTO content_publications (
        publication_id, platform, post_ref, published_at, created_at,
        payload_hash, publication_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "publication-one",
      "instagram",
      "post-one",
      "2026-09-01T08:00:00.000Z",
      "2026-09-02T08:00:00.000Z",
      "publication-hash",
      "{}",
    );
    database.prepare(`
      INSERT INTO content_analytics_snapshots (
        snapshot_id, publication_id, checkpoint, revision, captured_at,
        created_at, archived, payload_hash, idempotency_key, snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "snapshot-one",
      "publication-one",
      "24h",
      1,
      "2026-09-02T08:00:00.000Z",
      "2026-09-02T08:00:00.000Z",
      0,
      "snapshot-hash",
      "snapshot-request-one",
      "{}",
    );

    for (const table of ["content_publications", "content_analytics_snapshots"]) {
      assert.throws(
        () => database.prepare(`UPDATE ${table} SET payload_hash = 'tampered'`).run(),
        new RegExp(`${table} is append-only`),
      );
      assert.throws(
        () => database.prepare(`DELETE FROM ${table}`).run(),
        new RegExp(`${table} is append-only`),
      );
    }
  } finally {
    database.close();
  }
});
