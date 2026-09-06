import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { validateCalmFeedbackAction } from "../functions/api/content-os/calm-feedback/index.js";
import { validatePracticeAction } from "../functions/api/content-os/practice/index.js";
import { PUBLIC_FILES } from "../scripts/build-site.mjs";

function client(overrides = {}) {
  return {
    displayName: "Synthetic Parent",
    childAge: 8,
    region: "Malaysia",
    concern: "One synthetic concern",
    stage: "RECORD_REVIEW_REQUIRED",
    serviceCode: "RM350",
    nextAction: "Verify the synthetic record.",
    sourceStatus: "UNVERIFIED",
    knownFacts: [],
    openQuestions: [],
    boundaryFlags: [],
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    status: "DOCUMENTATION_DRAFT",
    scheduledAt: "2026-09-10",
    occurredAt: null,
    preparation: "Synthetic preparation",
    privateNotes: "Synthetic private note",
    parentSummary: "Synthetic parent summary",
    actionPlan: "Synthetic action plan",
    documentStatus: "DRAFT",
    ...overrides,
  };
}

test("Practice Console accepts controlled client, session and export actions", () => {
  const caseId = "CASE-2026-ABC234";
  const sessionId = "12345678-1234-1234-1234-123456789abc";
  for (const payload of [
    { action: "create_client", client: client(), reason: "Synthetic test" },
    { action: "update_client", caseId, expectedRevision: 1, client: client(), reason: "Synthetic update" },
    { action: "create_session", caseId, scheduledAt: null },
    { action: "save_session", sessionId, expectedRevision: 1, session: session() },
    { action: "prepare_export", sessionId, destination: "LOCAL" },
    { action: "prepare_export", sessionId, destination: "GOOGLE_DRIVE" },
    { action: "confirm_drive_export", exportId: sessionId, providerFileId: "synthetic-drive-file-id" },
    { action: "mark_delivered", sessionId, expectedRevision: 2 },
  ]) assert.equal(validatePracticeAction(payload), null, payload.action);
});

test("Practice Console rejects unsafe or incomplete writes", () => {
  assert.match(validatePracticeAction({ action: "create_client", client: client({ displayName: "" }), reason: "test" }), /required client/i);
  assert.match(validatePracticeAction({ action: "update_client", caseId: "bad", expectedRevision: 1, client: client(), reason: "test" }), /invalid/i);
  assert.match(validatePracticeAction({ action: "save_session", sessionId: "12345678-1234-1234-1234-123456789abc", expectedRevision: 1, session: session({ documentStatus: "CJ_APPROVED", parentSummary: "" }) }), /requires both/i);
  assert.match(validatePracticeAction({ action: "prepare_export", sessionId: "12345678-1234-1234-1234-123456789abc", destination: "PUBLIC" }), /invalid/i);
  assert.match(validatePracticeAction({ action: "save_session", sessionId: "12345678-1234-1234-1234-123456789abc", expectedRevision: 1, session: session({ documentStatus: "DELIVERED" }) }), /recorded export workflow/i);
  assert.match(validatePracticeAction({ action: "create_session", caseId: "CASE-2026-ABC234", scheduledAt: "2026-02-30" }), /date/i);
  assert.match(validatePracticeAction({ action: "create_session", caseId: "CASE-2026-ABC234", scheduledAt: "2026-99-99TZZZ" }), /date/i);
});

test("Calm inbox accepts only controlled triage records", () => {
  const valid = { action: "set_triage", feedbackId: "12345678-1234-1234-1234-123456789abc", status: "ACTION_NEEDED", decisionNote: "Review wording", expectedRevision: 0 };
  assert.equal(validateCalmFeedbackAction(valid), null);
  assert.match(validateCalmFeedbackAction({ ...valid, status: "DELETE" }), /status/i);
  assert.match(validateCalmFeedbackAction({ ...valid, unexpected: true }), /schema/i);
});

test("practice and Calm workflows are private build assets with durable schemas", async () => {
  for (const path of [
    "content-os/practice/index.html",
    "content-os/practice/app.js",
    "content-os/calm-feedback/index.html",
    "content-os/calm-feedback/app.js",
  ]) assert.ok(PUBLIC_FILES.includes(path), path);
  for (const path of [
    "functions/api/content-os/practice/index.js",
    "functions/api/content-os/calm-feedback/index.js",
    "migrations/0007_practice_and_feedback_workflows.sql",
    "migrations/0008_workflow_concurrency_hardening.sql",
  ]) assert.ok(!PUBLIC_FILES.includes(path), path);

  const migration = await readFile(new URL("../migrations/0007_practice_and_feedback_workflows.sql", import.meta.url), "utf8");
  for (const table of ["practice_clients", "practice_client_revisions", "practice_sessions", "practice_session_revisions", "practice_exports", "calm_feedback_triage", "calm_feedback_triage_events"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /practice_client_revisions is append-only/);
  assert.match(migration, /practice_session_revisions is append-only/);
  assert.match(migration, /calm_feedback_triage_events is append-only/);
  const hardening = await readFile(new URL("../migrations/0008_workflow_concurrency_hardening.sql", import.meta.url), "utf8");
  assert.match(hardening, /UNIQUE INDEX IF NOT EXISTS idx_calm_feedback_triage_events_revision/);
  assert.match(hardening, /calm feedback triage revision conflict/);

  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const productionBindings = config.env.production.d1_databases.map((item) => item.binding);
  assert.deepEqual(productionBindings, ["APC_CONTENT_OS_DB", "APC_CALM_FEEDBACK_DB"]);
  assert.equal(config.env.production.vars.APC_PRACTICE_LIVE_WRITES_ENABLED, "false");
});

test("all Content OS migrations apply together and keep workflow history append-only", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    for (let number = 1; number <= 8; number += 1) {
      const names = [
        "0001_content_os_state.sql",
        "0002_content_os_v23_hardening.sql",
        "0003_episode_workflow.sql",
        "0004_analytics_connectors.sql",
        "0005_episode_tracking.sql",
        "0006_episode_management.sql",
        "0007_practice_and_feedback_workflows.sql",
        "0008_workflow_concurrency_hardening.sql",
      ];
      database.exec(await readFile(new URL(`../migrations/${names[number - 1]}`, import.meta.url), "utf8"));
    }
    database.prepare(`INSERT INTO practice_clients
      (case_id, display_name, child_age, region, concern, stage, service_code, next_action, source_status,
       known_facts_json, open_questions_json, boundary_flags_json, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', 1, ?, ?)`)
      .run("CASE-2026-ABC234", "Synthetic Parent", 8, "Malaysia", "Synthetic concern", "RECORD_REVIEW_REQUIRED", "RM350", "Verify", "UNVERIFIED", "2026-09-06T00:00:00Z", "2026-09-06T00:00:00Z");
    database.prepare(`INSERT INTO practice_client_revisions
      (revision_id, case_id, revision, event_type, actor, reason, snapshot_json, created_at)
      VALUES (?, ?, 1, 'CREATED', 'CJ', ?, '{}', ?)`)
      .run("12345678-1234-1234-1234-123456789abc", "CASE-2026-ABC234", "Synthetic test", "2026-09-06T00:00:00Z");
    assert.throws(() => database.prepare("UPDATE practice_client_revisions SET reason = 'changed' WHERE case_id = ?").run("CASE-2026-ABC234"), /append-only/);
    database.prepare("INSERT INTO calm_feedback_triage (feedback_id, status, decision_note, revision, updated_at) VALUES (?, 'REVIEWED', 'First decision', 1, ?)").run("feedback-12345678", "2026-09-06T00:00:00Z");
    database.prepare("INSERT INTO calm_feedback_triage_events (event_id, feedback_id, status, decision_note, revision, actor, created_at) VALUES (?, ?, 'REVIEWED', 'First decision', 1, 'CJ', ?)").run("event-12345678", "feedback-12345678", "2026-09-06T00:00:00Z");
    assert.throws(() => database.prepare("INSERT INTO calm_feedback_triage_events (event_id, feedback_id, status, decision_note, revision, actor, created_at) VALUES (?, ?, 'ACTION_NEEDED', 'Losing decision', 1, 'CJ', ?)").run("event-87654321", "feedback-12345678", "2026-09-06T00:00:01Z"), /revision conflict|UNIQUE/);
  } finally {
    database.close();
  }
});

test("Content OS links to operational pages instead of local or database-admin shortcuts", async () => {
  const home = await readFile(new URL("../content-os/index.html", import.meta.url), "utf8");
  assert.match(home, /href="\/content-os\/practice\/"/);
  assert.match(home, /href="\/content-os\/calm-feedback\/"/);
  assert.doesNotMatch(home, /127\.0\.0\.1:4173/);
  assert.doesNotMatch(home, /dash\.cloudflare\.com\/.*\/studio/);
});

test("Practice Console exposes bounded append-only activity without revision snapshots", async () => {
  const source = await readFile(new URL("../functions/api/content-os/practice/index.js", import.meta.url), "utf8");
  const page = await readFile(new URL("../content-os/practice/index.html", import.meta.url), "utf8");
  assert.match(source, /clientHistory/);
  assert.match(source, /sessionHistory/);
  assert.match(source, /activity:/);
  assert.doesNotMatch(source, /SELECT[^\n]+snapshot_json[^\n]+practice_(?:client|session)_revisions/);
  assert.match(page, /id="history"/);
  assert.match(page, /id="activityList"/);
});
