import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { MINIMUM_REDTEAM_PASS_SCORE, onRequestPost, validateAction } from "../functions/api/content-os/episode-workflow/index.js";
import { PUBLIC_FILES } from "../scripts/build-site.mjs";
import { MASTER_VIDEO_RULES, masterVideoRulePromptLines } from "../content-os/video-rules.js";

const masterRules = {
  version: MASTER_VIDEO_RULES.version,
  sha256: MASTER_VIDEO_RULES.sha256,
  sourcePath: MASTER_VIDEO_RULES.sourcePath,
};

function importedPack(overrides = {}) {
  return {
    schemaVersion: "apc.episode_pack.v2",
    episodeId: "EP09",
    promptBinding: { artifactId: "11111111-1111-4111-8111-111111111111", sha256: "a".repeat(64) },
    masterRules: { version: masterRules.version, sha256: masterRules.sha256 },
    redteam: { result: "PASS", score: 9.5, risks: [], fixes: [] },
    hookGate: { result: "PASS", yesCount: 5, checks: [true, true, true, true, true] },
    finalDecision: "FILM",
    spokenScript: "Can I tell you something?\nHere is the careful explanation.",
    filmingBoard: [{ start: "0:00", end: "0:05", spokenWords: "Exact words", direction: "Talking head", props: ["None"], actions: ["Look into the lens"] }],
    overlays: [],
    hyperframesPrompt: "Create the overlay.",
    visualAssets: { cards: [] },
    editNotes: [],
    sourceNotes: [],
    platformCopy: { instagram: "Caption" },
    claimCautions: [],
    ...overrides,
  };
}

function carouselPack(overrides = {}) {
  const slides = Array.from({ length: 5 }, (_, index) => ({
    number: index + 1,
    purpose: index === 0 ? "Hook and practical payoff" : "Develop the idea",
    headline: "Slide headline " + (index + 1),
    body: "Short copy",
    visualDirection: "Clear mobile layout",
    sourcePill: index === 0 ? "Source 2026" : "",
    action: "Prepare the slide",
  }));
  return importedPack({
    contentType: "CAROUSEL",
    finalDecision: "PRODUCE",
    spokenScript: "",
    filmingBoard: [],
    overlays: [],
    hyperframesPrompt: "",
    carousel: { slides, designNotes: ["Use the APC palette."], caption: "Save this for later." },
    platformCopy: { instagram: "Save this for later.", tiktok: "Photo Mode caption" },
    ...overrides,
  });
}

async function migrationSql(number) {
  const names = [
    "0001_content_os_state.sql",
    "0002_content_os_v23_hardening.sql",
    "0003_episode_workflow.sql",
    "0004_analytics_connectors.sql",
    "0005_episode_tracking.sql",
    "0006_episode_management.sql",
    "0007_practice_and_feedback_workflows.sql",
    "0008_workflow_concurrency_hardening.sql",
    "0009_practice_client_journey.sql",
    "0010_private_episode_number.sql",
    "0011_episode_artifact_carousel_decision.sql",
  ];
  return readFile(new URL(`../migrations/${names[number - 1]}`, import.meta.url), "utf8");
}

async function applyMigrations(database, through = 11) {
  for (let number = 1; number <= through; number += 1) {
    const sql = await migrationSql(number);
    database.exec(number === 11 ? `BEGIN;\n${sql}\nCOMMIT;` : sql);
  }
}

class SqliteD1Statement {
  constructor(database, sql, parameters = []) {
    this.database = database;
    this.sql = sql;
    this.parameters = parameters;
  }
  bind(...parameters) { return new SqliteD1Statement(this.database, this.sql, parameters); }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
  executeForBatch() {
    if (/^\s*(?:SELECT|PRAGMA)\b/i.test(this.sql)) return { success: true, results: this.database.prepare(this.sql).all(...this.parameters) };
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new SqliteD1Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map(statement => statement.executeForBatch());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class RaceD1 extends SqliteD1 {
  constructor(database, beforeBatch) {
    super(database);
    this.beforeBatch = beforeBatch;
  }
  async batch(statements) {
    if (this.beforeBatch) {
      const beforeBatch = this.beforeBatch;
      this.beforeBatch = null;
      beforeBatch();
    }
    return super.batch(statements);
  }
}

function bindPackToCurrentPrompt(database, pack) {
  const row = database.prepare("SELECT production_pack_json FROM episodes WHERE id = ?").get(pack.episodeId);
  const prompt = JSON.parse(row.production_pack_json).prompt;
  return { ...pack, promptBinding: { artifactId: prompt.artifactId, sha256: prompt.sha256 } };
}

async function postWorkflow(database, payload, binding = new SqliteD1(database)) {
  const request = new Request("https://example.test/api/content-os/episode-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://example.test", "X-APC-Content-OS": "1" },
    body: JSON.stringify(payload),
  });
  return onRequestPost({ request, env: { APC_CONTENT_OS_DB: binding } });
}

test("accepts the governed and tracked episode workflow actions", () => {
  const hash = "a".repeat(64);
  const valid = [
    { action: "create_episode", episode: { id: "EP09", title: "A useful episode", researchItemId: null } },
    { action: "create_tracked_prompt", episode: { id: "EP09", title: "A useful episode", researchItemId: null }, prompt: { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Line one\nLine two", sourceContext: { sourceType: "manual" }, masterRules }, idempotencyKey: "prompt:EP09:12345678" },
    { action: "save_prompt_revision", episodeId: "EP09", prompt: { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", preferredScript: "Keep my preferred opening.", text: "Revised prompt", sourceContext: { sourceType: "manual" }, masterRules }, idempotencyKey: "prompt-revision:EP09:12345678" },
    { action: "import_production_pack", episodeId: "EP09", pack: importedPack(), idempotencyKey: "pack:EP09:12345678" },
    { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:12345678" },
    { action: "update_episode_details", episodeId: "EP09", title: "A revised useful episode", displayNumber: 2, idempotencyKey: "episode-edit:EP09:12345678" },
    { action: "set_episode_archived", episodeId: "EP09", archived: true, idempotencyKey: "archive:EP09:12345678" },
    { action: "update_episode_status", episodeId: "EP09", status: "SCRIPT_LOCKED" },
    { action: "save_review", episodeId: "EP09", manifest: { label: "v1", mode: "full", video: { sha256: hash }, review: { status: "NOT_READY" } } },
  ];
  for (const payload of valid) assert.equal(validateAction(payload), null, payload.action);
});

test("rejects unknown fields and invalid identities", () => {
  assert.match(validateAction({ action: "create_episode", episode: { id: "bad", title: "Test", researchItemId: null } }), /episode id/i);
  assert.match(validateAction({ action: "update_episode_status", episodeId: "EP09", status: "DONE" }), /invalid/i);
  assert.match(validateAction({ action: "save_review", episodeId: "EP09", manifest: { label: "v1", mode: "full", video: {} } }), /identity/i);
  assert.match(validateAction({ action: "create_episode", episode: { id: "EP09", title: "Test", researchItemId: null }, extra: true }), /schema/i);
  assert.match(validateAction({ action: "update_episode_details", episodeId: "EP09", title: "Test", displayNumber: 2.5, idempotencyKey: "episode-edit:EP09:12345678" }), /whole number/i);
  assert.match(validateAction({ action: "save_production_pack", episodeId: "EP09", pack: { latestPackage: {} } }), /not supported/i);
  const unboundPack = importedPack();
  delete unboundPack.promptBinding;
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: unboundPack, idempotencyKey: "pack:EP09:unbound01" }), /prompt binding/i);
});

test("episode schema extends the existing governed research and analytics stores", async () => {
  const migration = await readFile(new URL("../migrations/0003_episode_workflow.sql", import.meta.url), "utf8");
  const trackingMigration = await readFile(new URL("../migrations/0005_episode_tracking.sql", import.meta.url), "utf8");
  const managementMigration = await readFile(new URL("../migrations/0006_episode_management.sql", import.meta.url), "utf8");
  const privateNumberMigration = await readFile(new URL("../migrations/0010_private_episode_number.sql", import.meta.url), "utf8");
  const carouselDecisionMigration = await readFile(new URL("../migrations/0011_episode_artifact_carousel_decision.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS episodes/);
  assert.match(migration, /REFERENCES research_items\(item_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS video_reviews/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS (research_runs|content_publications|content_analytics_snapshots)/);
  assert.match(trackingMigration, /CREATE TABLE IF NOT EXISTS episode_artifacts/);
  assert.match(trackingMigration, /CREATE TABLE IF NOT EXISTS episode_events/);
  assert.match(trackingMigration, /episode_artifacts is append-only/);
  assert.match(trackingMigration, /episode_events is append-only/);
  assert.doesNotMatch(trackingMigration, /ALTER TABLE content_(?:publications|analytics_snapshots)/);
  assert.match(managementMigration, /ALTER TABLE episodes ADD COLUMN archived_at TEXT/);
  assert.doesNotMatch(managementMigration, /DELETE FROM|DROP TABLE|ALTER TABLE content_(?:publications|analytics_snapshots)/);
  assert.match(privateNumberMigration, /ALTER TABLE episodes ADD COLUMN display_number INTEGER/);
  assert.match(privateNumberMigration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_active_display_number/);
  assert.doesNotMatch(privateNumberMigration, /DELETE FROM|DROP TABLE|ALTER TABLE content_(?:publications|analytics_snapshots)/);
  assert.match(carouselDecisionMigration, /'FILM', 'PRODUCE', 'REVISE'/);
  assert.match(carouselDecisionMigration, /PRAGMA defer_foreign_keys = ON/);
  assert.match(carouselDecisionMigration, /episode_artifacts is append-only/);
  assert.match(carouselDecisionMigration, /latestPackage\.promptSha256/);
  assert.doesNotMatch(carouselDecisionMigration, /ALTER TABLE content_(?:publications|analytics_snapshots)/);
});

test("carousel decision migration preserves episode history, foreign keys and append-only controls", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database, 10);
    const promptHash = "a".repeat(64);
    const packHash = "b".repeat(64);
    const record = JSON.stringify({
      schemaVersion: "apc.episode_record.v2",
      episodeId: "EP09",
      prompt: { artifactId: "prompt-one", version: 1, sha256: promptHash },
      latestPackage: { artifactId: "pack-one", version: 1, sha256: packHash },
    });
    database.prepare(`INSERT INTO episodes
      (id, title, status, production_pack_json, created_at, updated_at, archived_at, display_number)
      VALUES ('EP09', 'Synthetic episode', 'APPROVED', ?, '2026-09-07T00:00:00Z', '2026-09-07T00:00:00Z', NULL, 9)`).run(record);
    database.prepare(`INSERT INTO episode_artifacts
      (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
      VALUES ('prompt-one', 'EP09', 'PROMPT', 1, ?, '{}', 'NOT_APPLICABLE', NULL, NULL, '2026-09-07T00:00:00Z')`).run(promptHash);
    database.prepare(`INSERT INTO episode_artifacts
      (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
      VALUES ('pack-one', 'EP09', 'PRODUCTION_PACK', 1, ?, '{}', 'PASS', 'PASS', 'FILM', '2026-09-07T00:01:00Z')`).run(packHash);
    database.prepare(`INSERT INTO episode_events
      (event_id, episode_id, event_type, artifact_id, idempotency_key, payload_sha256, metadata_json, created_at)
      VALUES ('event-one', 'EP09', 'PACK_IMPORTED', 'pack-one', 'event:EP09:12345678', ?, '{}', '2026-09-07T00:01:00Z')`).run(packHash);

    database.exec(`BEGIN;\n${await migrationSql(11)}\nCOMMIT;`);

    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_artifacts").get().count, 2);
    assert.equal(database.prepare("SELECT artifact_id FROM episode_events WHERE event_id = 'event-one'").get().artifact_id, "pack-one");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    const migratedRecord = JSON.parse(database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get().production_pack_json);
    assert.equal(migratedRecord.latestPackage.promptSha256, promptHash);
    database.prepare(`INSERT INTO episode_artifacts
      (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
      VALUES ('pack-two', 'EP09', 'PRODUCTION_PACK', 2, ?, '{}', 'PASS', 'PASS', 'PRODUCE', '2026-09-07T00:02:00Z')`).run("c".repeat(64));
    assert.throws(() => database.prepare("UPDATE episode_artifacts SET final_decision = 'REVISE' WHERE artifact_id = 'pack-two'").run(), /append-only/);
    assert.throws(() => database.prepare(`INSERT INTO episode_artifacts
      (artifact_id, episode_id, artifact_type, version, payload_sha256, payload_json, redteam_status, hook_gate_status, final_decision, created_at)
      VALUES ('pack-three', 'EP09', 'PRODUCTION_PACK', 3, ?, '{}', 'PASS', 'PASS', 'PUBLISH', '2026-09-07T00:03:00Z')`).run("d".repeat(64)), /CHECK constraint failed/);
  } finally {
    database.close();
  }
});

test("tracked package contract requires the red-team and five-check filming gate", () => {
  assert.equal(MINIMUM_REDTEAM_PASS_SCORE, 9);
  const failedRedTeam = importedPack({ redteam: { result: "FAIL", score: 4, risks: ["Overclaim"], fixes: [] }, finalDecision: "REVISE" });
  assert.equal(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: failedRedTeam, idempotencyKey: "pack:EP09:failed001" }), null);

  const mismatchedChecks = importedPack({ hookGate: { result: "PASS", yesCount: 5, checks: [true, true, true, false, false] } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: mismatchedChecks, idempotencyKey: "pack:EP09:badchecks" }), /hook gate/i);

  const wrongScoreScale = importedPack({ redteam: { result: "PASS", score: 95, risks: [], fixes: [] } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: wrongScoreScale, idempotencyKey: "pack:EP09:badscore1" }), /between 0 and 10/i);

  const weakPass = importedPack({ redteam: { result: "PASS", score: 8.9, risks: [], fixes: [] } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: weakPass, idempotencyKey: "pack:EP09:weakpass1" }), /at least 9\/10/i);
});

test("tracked package contract supports backward-compatible scene preparation and carousel packs", () => {
  assert.equal(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: carouselPack(), idempotencyKey: "pack:EP09:carousel1" }), null);
  const missingSlides = carouselPack({ carousel: { slides: [], designNotes: [], caption: "Caption" } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: missingSlides, idempotencyKey: "pack:EP09:carousel2" }), /carousel/i);
  const videoWithCarouselDecision = importedPack({ contentType: "VIDEO", finalDecision: "PRODUCE" });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: videoWithCarouselDecision, idempotencyKey: "pack:EP09:video0001" }), /video pack/i);
});

test("video packs accept explicit timed pauses but reject accidental blank scenes", () => {
  const timedPause = importedPack({
    filmingBoard: [
      { start: "0:00", end: "0:05", spokenWords: "Behaviour gives us a clue.", direction: "Look into the lens.", props: ["None"], actions: ["Speak slowly."] },
      { start: "0:05", end: "0:07", spokenWords: "", direction: "Hold two full beats of silence.", props: ["None"], actions: ["Remain silent."] },
    ],
  });
  assert.equal(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: timedPause, idempotencyKey: "pack:EP09:pause0001" }), null);

  const accidentalBlank = importedPack({
    filmingBoard: [{ start: "0:00", end: "0:05", spokenWords: "", direction: "Talking head", props: ["None"], actions: ["Hold eye contact"] }],
  });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: accidentalBlank, idempotencyKey: "pack:EP09:blank0001" }), /production content/i);
});

test("tracked prompts and packs must use the exact canonical master identity", () => {
  const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Current prompt", sourceContext: { sourceType: "manual" }, masterRules };
  assert.equal(validateAction({ action: "save_prompt_revision", episodeId: "EP09", prompt, idempotencyKey: "prompt:EP09:canonical1" }), null);
  assert.match(validateAction({ action: "save_prompt_revision", episodeId: "EP09", prompt: { ...prompt, masterRules: { ...masterRules, sha256: "f".repeat(64) } }, idempotencyKey: "prompt:EP09:forged001" }), /canonical APC master/i);
  assert.match(validateAction({ action: "save_prompt_revision", episodeId: "EP09", prompt: { ...prompt, masterRules: { ...masterRules, sourcePath: "archive/old-rules.md" } }, idempotencyKey: "prompt:EP09:forged002" }), /canonical APC master/i);
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: importedPack({ masterRules: { version: "2026-09-06.0", sha256: masterRules.sha256 } }), idempotencyKey: "pack:EP09:forged0001" }), /canonical APC master/i);
});

test("a prompt revision invalidates the prior pack and prevents stale script locking", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database);
    const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Original prompt", sourceContext: { sourceType: "manual" }, masterRules };
    let response = await postWorkflow(database, {
      action: "create_tracked_prompt",
      episode: { id: "EP09", title: "Synthetic episode", researchItemId: null },
      prompt,
      idempotencyKey: "prompt:EP09:integration1",
    });
    assert.equal(response.status, 201, await response.text());

    const originalPack = bindPackToCurrentPrompt(database, importedPack());
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack: originalPack, idempotencyKey: "pack:EP09:integration001" });
    assert.equal(response.status, 201, await response.text());
    let record = JSON.parse(database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get().production_pack_json);
    assert.equal(record.latestPackage.promptSha256, record.prompt.sha256);

    response = await postWorkflow(database, { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:integration001" });
    assert.equal(response.status, 200, await response.text());

    response = await postWorkflow(database, {
      action: "save_prompt_revision",
      episodeId: "EP09",
      prompt: { ...prompt, text: "Revised prompt requiring a new result" },
      idempotencyKey: "prompt-revision:EP09:integration2",
    });
    assert.equal(response.status, 201, await response.text());
    record = JSON.parse(database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get().production_pack_json);
    assert.equal(record.latestPackage, null);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_artifacts WHERE episode_id = 'EP09' AND artifact_type = 'PRODUCTION_PACK'").get().count, 1, "history remains immutable");

    response = await postWorkflow(database, { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:integration002" });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /required before locking/i);

    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack: originalPack, idempotencyKey: "pack:EP09:stale-reimport1" });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /current tracked prompt/i);
    record = JSON.parse(database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get().production_pack_json);
    assert.equal(record.latestPackage, null);

    const revisedPack = bindPackToCurrentPrompt(database, importedPack({ spokenScript: "A newly audited script for the revised prompt." }));
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack: revisedPack, idempotencyKey: "pack:EP09:integration002" });
    assert.equal(response.status, 201, await response.text());
    response = await postWorkflow(database, { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:integration003" });
    assert.equal(response.status, 200, await response.text());
  } finally {
    database.close();
  }
});

test("a governed carousel pack persists its PRODUCE decision in D1", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database);
    const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Carousel post", notes: "", text: "Carousel prompt", sourceContext: { sourceType: "manual" }, masterRules };
    let response = await postWorkflow(database, {
      action: "create_tracked_prompt",
      episode: { id: "EP10", title: "Synthetic carousel", researchItemId: null },
      prompt,
      idempotencyKey: "prompt:EP10:integration1",
    });
    assert.equal(response.status, 201, await response.text());
    const pack = bindPackToCurrentPrompt(database, carouselPack({ episodeId: "EP10" }));
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP10", pack, idempotencyKey: "pack:EP10:integration001" });
    assert.equal(response.status, 201, await response.text());
    assert.equal(database.prepare("SELECT final_decision FROM episode_artifacts WHERE episode_id = 'EP10' AND artifact_type = 'PRODUCTION_PACK'").get().final_decision, "PRODUCE");
  } finally {
    database.close();
  }
});

test("a concurrent prompt change rolls back a stale package import", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database);
    const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Original prompt", sourceContext: { sourceType: "manual" }, masterRules };
    let response = await postWorkflow(database, {
      action: "create_tracked_prompt",
      episode: { id: "EP09", title: "Synthetic race episode", researchItemId: null },
      prompt,
      idempotencyKey: "prompt:EP09:race0001",
    });
    assert.equal(response.status, 201, await response.text());
    const pack = bindPackToCurrentPrompt(database, importedPack());
    const raceBinding = new RaceD1(database, () => {
      const row = database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get();
      const record = JSON.parse(row.production_pack_json);
      record.prompt = { artifactId: "22222222-2222-4222-8222-222222222222", version: 2, sha256: "b".repeat(64) };
      record.latestPackage = null;
      database.prepare("UPDATE episodes SET production_pack_json = ? WHERE id = 'EP09'").run(JSON.stringify(record));
    });
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack, idempotencyKey: "pack:EP09:race000001" }, raceBinding);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /prompt changed while/i);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_artifacts WHERE episode_id = 'EP09' AND artifact_type = 'PRODUCTION_PACK'").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_events WHERE episode_id = 'EP09' AND event_type = 'PACK_IMPORTED'").get().count, 0);
  } finally {
    database.close();
  }
});

test("a concurrent prompt change cannot lock an invalidated package", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database);
    const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Original prompt", sourceContext: { sourceType: "manual" }, masterRules };
    let response = await postWorkflow(database, {
      action: "create_tracked_prompt",
      episode: { id: "EP09", title: "Synthetic lock race", researchItemId: null },
      prompt,
      idempotencyKey: "prompt:EP09:lockrace1",
    });
    assert.equal(response.status, 201, await response.text());
    const pack = bindPackToCurrentPrompt(database, importedPack());
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack, idempotencyKey: "pack:EP09:lockrace01" });
    assert.equal(response.status, 201, await response.text());
    const raceBinding = new RaceD1(database, () => {
      const row = database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get();
      const record = JSON.parse(row.production_pack_json);
      record.prompt = { artifactId: "33333333-3333-4333-8333-333333333333", version: 2, sha256: "c".repeat(64) };
      record.latestPackage = null;
      database.prepare("UPDATE episodes SET status = 'APPROVED', production_pack_json = ? WHERE id = 'EP09'").run(JSON.stringify(record));
    });
    response = await postWorkflow(database, { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:lockrace01" }, raceBinding);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed while the script was locking/i);
    assert.equal(database.prepare("SELECT status FROM episodes WHERE id = 'EP09'").get().status, "APPROVED");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_events WHERE idempotency_key = 'lock:EP09:lockrace01'").get().count, 0);
  } finally {
    database.close();
  }
});

test("a concurrent prompt change cannot advance an invalidated package", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database);
    const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Original prompt", sourceContext: { sourceType: "manual" }, masterRules };
    let response = await postWorkflow(database, {
      action: "create_tracked_prompt",
      episode: { id: "EP09", title: "Synthetic stage race", researchItemId: null },
      prompt,
      idempotencyKey: "prompt:EP09:stagerace",
    });
    assert.equal(response.status, 201, await response.text());
    const pack = bindPackToCurrentPrompt(database, importedPack());
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack, idempotencyKey: "pack:EP09:stagerace1" });
    assert.equal(response.status, 201, await response.text());
    response = await postWorkflow(database, { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:stagerace1" });
    assert.equal(response.status, 200, await response.text());
    const raceBinding = new RaceD1(database, () => {
      const row = database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get();
      const record = JSON.parse(row.production_pack_json);
      record.prompt = { artifactId: "44444444-4444-4444-8444-444444444444", version: 2, sha256: "d".repeat(64) };
      record.latestPackage = null;
      database.prepare("UPDATE episodes SET status = 'APPROVED', production_pack_json = ? WHERE id = 'EP09'").run(JSON.stringify(record));
    });
    response = await postWorkflow(database, { action: "update_episode_status", episodeId: "EP09", status: "FILMED" }, raceBinding);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed while advancing/i);
    assert.equal(database.prepare("SELECT status FROM episodes WHERE id = 'EP09'").get().status, "APPROVED");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_events WHERE episode_id = 'EP09' AND event_type = 'STATUS_CHANGED'").get().count, 0);
  } finally {
    database.close();
  }
});

test("a concurrent script revision cannot mark a stale video review READY", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyMigrations(database);
    const prompt = { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Original prompt", sourceContext: { sourceType: "manual" }, masterRules };
    let response = await postWorkflow(database, {
      action: "create_tracked_prompt",
      episode: { id: "EP09", title: "Synthetic review race", researchItemId: null },
      prompt,
      idempotencyKey: "prompt:EP09:reviewrace",
    });
    assert.equal(response.status, 201, await response.text());
    const pack = bindPackToCurrentPrompt(database, importedPack());
    response = await postWorkflow(database, { action: "import_production_pack", episodeId: "EP09", pack, idempotencyKey: "pack:EP09:reviewrace1" });
    assert.equal(response.status, 201, await response.text());
    response = await postWorkflow(database, { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:reviewrace1" });
    assert.equal(response.status, 200, await response.text());
    response = await postWorkflow(database, { action: "update_episode_status", episodeId: "EP09", status: "FILMED" });
    assert.equal(response.status, 200, await response.text());
    const raceBinding = new RaceD1(database, () => {
      const row = database.prepare("SELECT production_pack_json FROM episodes WHERE id = 'EP09'").get();
      const record = JSON.parse(row.production_pack_json);
      record.prompt = { artifactId: "55555555-5555-4555-8555-555555555555", version: 2, sha256: "e".repeat(64) };
      record.latestPackage = null;
      database.prepare("UPDATE episodes SET status = 'SCRIPT_LOCKED', production_pack_json = ? WHERE id = 'EP09'").run(JSON.stringify(record));
    });
    const manifest = { label: "final", mode: "ready", video: { sha256: "f".repeat(64) }, review: { status: "READY", score: 95 } };
    response = await postWorkflow(database, { action: "save_review", episodeId: "EP09", manifest }, raceBinding);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed while saving the review/i);
    assert.equal(database.prepare("SELECT status FROM episodes WHERE id = 'EP09'").get().status, "SCRIPT_LOCKED");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM video_reviews WHERE episode_id = 'EP09'").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM episode_events WHERE episode_id = 'EP09' AND event_type = 'VIDEO_REVIEWED'").get().count, 0);
  } finally {
    database.close();
  }
});

test("Episode Studio assets are in the public allowlist without exposing operational files", () => {
  assert.ok(PUBLIC_FILES.includes("content-os/episodes/index.html"));
  assert.ok(PUBLIC_FILES.includes("content-os/episodes/app.js"));
  assert.ok(PUBLIC_FILES.includes("content-os/video-rules.js"));
  assert.ok(PUBLIC_FILES.includes("content-os/topic-bank.js"));
  assert.ok(!PUBLIC_FILES.includes("migrations/0003_episode_workflow.sql"));
  assert.ok(!PUBLIC_FILES.includes("migrations/0005_episode_tracking.sql"));
  assert.ok(!PUBLIC_FILES.includes("functions/api/content-os/episode-workflow/index.js"));
});

test("Episode Studio uses only the synced APC master rules for filming-pack prompts", async () => {
  const episodeApp = await readFile(new URL("../content-os/episodes/app.js", import.meta.url), "utf8");
  const mainApp = await readFile(new URL("../content-os/app.js", import.meta.url), "utf8");
  assert.equal(MASTER_VIDEO_RULES.version, "2026-09-06.1");
  assert.equal(MASTER_VIDEO_RULES.legacySourcesAllowed, false);
  assert.match(MASTER_VIDEO_RULES.sha256, /^[a-f0-9]{64}$/);
  for (const instruction of [
    "SOURCE POLICY: Use only this master rule block",
    "REPLICATION POLICY: Follow this approved sequence and production pattern by default",
    "CURRENT AUDIENCE DEFAULT: Create for parents of autistic teenagers",
    "Begin with \"Can I tell you something?\" followed immediately by one verified statistic or specific number",
    "CURIOSITY BRIDGE: At approximately 7 to 12 seconds",
    "VISUAL CARDS: Provide 340 by 605 pixel",
    "Do not create an SRT file",
  ]) {
    assert.ok(MASTER_VIDEO_RULES.activeRules.some(line => line.includes(instruction)), instruction);
  }
  const prompt = masterVideoRulePromptLines().join("\n");
  assert.match(prompt, /Legacy rule sources allowed: NO/);
  assert.match(episodeApp, /masterVideoRulePromptLines\(\)/);
  assert.match(mainApp, /masterVideoRulePromptLines\(\)/);
  assert.match(episodeApp, /PRIVATE TRACKING ONLY/);
  assert.match(episodeApp, /Never include the episode ID or episode number/);
  assert.match(mainApp, /PRIVATE TRACKING ONLY/);
  assert.doesNotMatch(episodeApp, /DEFAULT CREATIVE MODE: WINNER-RECIPE REPLICATION/);
  assert.doesNotMatch(mainApp, /DEFAULT CREATIVE MODE: WINNER-RECIPE REPLICATION/);
});

test("Episode Studio tracks prompt and package versions before filming", async () => {
  const episodeApp = await readFile(new URL("../content-os/episodes/app.js", import.meta.url), "utf8");
  const episodeHtml = await readFile(new URL("../content-os/episodes/index.html", import.meta.url), "utf8");
  const mainApp = await readFile(new URL("../content-os/app.js", import.meta.url), "utf8");
  const mainHtml = await readFile(new URL("../content-os/index.html", import.meta.url), "utf8");
  assert.match(episodeApp, /action: "create_tracked_prompt"/);
  assert.match(episodeApp, /action: "save_prompt_revision"/);
  assert.match(episodeApp, /action: "import_production_pack"/);
  assert.match(episodeApp, /action: "lock_script"/);
  assert.match(episodeApp, /action: "update_episode_details"/);
  assert.match(episodeApp, /action: "set_episode_archived"/);
  assert.match(episodeApp, /run \/redteam/);
  assert.match(episodeApp, /checks: \[true, true, true, true, true\]/);
  assert.match(episodeHtml, /id="import"/);
  assert.match(episodeHtml, /Paste Codex result \+ import/);
  assert.match(episodeHtml, /You do not need to isolate or edit the JSON yourself/);
  assert.match(episodeHtml, /red-team score of at least 9\/10/);
  assert.match(episodeHtml, /My preferred script or wording/);
  assert.match(episodeHtml, /Save edits \+ copy prompt/);
  assert.match(episodeHtml, /Save draft only/);
  assert.match(episodeApp, /CJ'S PREFERRED SCRIPT OR WORDING/);
  assert.match(episodeApp, /final red-team score of at least 9\/10/);
  assert.match(episodeApp, /const needsSave =/);
  assert.match(episodeHtml, /Produce and edit from one page/);
  assert.match(episodeHtml, /Download final HTML/);
  assert.match(episodeApp, /standalonePackHtml/);
  assert.match(episodeApp, /existingEpisodeForSource/);
  assert.match(episodeApp, /Rebuild it as a revision instead of creating a duplicate/);
  assert.match(episodeApp, /arrangeWorkflowSections/);
  assert.match(episodeApp, /Edit private number, title and view history/);
  assert.match(episodeApp, /Internal organisation only\. It is excluded from scripts, overlays and public captions/);
  assert.match(episodeApp, /Possible duplicate/);
  assert.match(episodeApp, /Archive duplicate/);
  assert.doesNotMatch(episodeApp, /Download \.md archive/);
  assert.doesNotMatch(episodeApp, /episodeMarkdownArchive/);
  assert.match(episodeApp, /createSelectedTopicPrompts/);
  assert.match(episodeApp, /pasteAndImportPackage/);
  assert.match(episodeHtml, /id="importFeedback"/);
  assert.match(episodeHtml, /Choose JSON file \+ import/);
  assert.match(episodeApp, /Package imported successfully\. Step 4 is ready below\./);
  assert.match(episodeApp, /await importPackage\(\)/);
  assert.match(episodeApp, /Silent beat\. Do not speak\./);
  assert.match(episodeApp, /explicit timed-pause direction/);
  assert.match(episodeApp, /No valid JSON package was found in the Codex response/);
  assert.match(episodeApp, /element\("importEpisode"\)\.value = episodeId/);
  assert.match(episodeApp, /existing item\(s\) skipped/);
  assert.match(episodeApp, /renderFilmingPackSwitcher/);
  assert.match(episodeApp, /function activePackArtifact/);
  assert.match(episodeApp, /activePackage\.promptSha256 !== activePrompt\.sha256/);
  assert.match(episodeApp, /SERVER-ISSUED PROMPT BINDING/);
  assert.match(episodeApp, /promptBinding: \{ artifactId: "__SERVER_PROMPT_ARTIFACT_ID__", sha256: "__SERVER_PROMPT_SHA256__" \}/);
  assert.match(episodeApp, /Number\(hookGate\?\.yesCount\) >= 4/);
  assert.match(episodeApp, /hookGate\?\.checks\?\.slice\(0, 3\)\.every\(Boolean\)/);
  assert.doesNotMatch(episodeApp, /latestArtifact\([^\n]*"PRODUCTION_PACK"/);
  assert.match(episodeApp, /Edit script before finalising/);
  assert.match(episodeApp, /Save draft \+ build review prompt/);
  assert.match(episodeApp, /spoken script changed after the previous audit/);
  assert.match(episodeHtml, /It does not create duplicate local files automatically/);
  assert.match(episodeApp, /Create carousel post/);
  assert.match(episodeApp, /Scene-by-scene filming board/);
  assert.match(episodeApp, /Prop checklist/);
  assert.match(episodeApp, /props: \["None"\]/);
  assert.match(episodeApp, /contentType: "CAROUSEL"/);
  assert.match(episodeHtml, /Cloud record here, video files on your SSD/);
  assert.match(episodeHtml, /Select several topics once/);
  assert.match(episodeHtml, /Create selected prompts/);
  assert.match(episodeHtml, /Download final HTML/);
  assert.match(episodeHtml, /Practice Console/);
  assert.match(episodeHtml, /Calm feedback inbox/);
  assert.match(episodeHtml, /archivedEpisodeList/);
  assert.match(mainApp, /arrangeContentWorkflowSections/);
  assert.match(mainApp, /function workflowArtifactByReference/);
  assert.match(mainApp, /packageReference\?\.promptSha256 === promptReference\?\.sha256/);
  assert.doesNotMatch(mainApp, /artifact_type === "PROMPT";\s*\}\)\.sort/);
  assert.match(mainApp, /already tracks this idea/);
  assert.match(mainHtml, /Publish \+ schedule analytics/);
  assert.match(mainHtml, /id="trackPublicationButton"/);
  assert.match(mainHtml, /Step 1 · Ready ideas \+ CJ backlog/);
  assert.match(mainHtml, /Step 2<\/p><h2 id="prompts-title">Build and track the episode/);
  assert.match(mainHtml, /Step 5<\/p><h2 id="analytics-title">Publish and collect episode performance/);
});
