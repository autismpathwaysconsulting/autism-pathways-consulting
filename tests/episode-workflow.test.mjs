import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateAction } from "../functions/api/content-os/episode-workflow/index.js";
import { PUBLIC_FILES } from "../scripts/build-site.mjs";

test("accepts the four governed episode workflow actions", () => {
  const hash = "a".repeat(64);
  const valid = [
    { action: "create_episode", episode: { id: "EP09", title: "A useful episode", researchItemId: null } },
    { action: "update_episode_status", episodeId: "EP09", status: "SCRIPT_LOCKED" },
    { action: "save_production_pack", episodeId: "EP09", pack: { prompt: "Create the pack" } },
    { action: "save_review", episodeId: "EP09", manifest: { label: "v1", mode: "full", video: { sha256: hash }, review: { status: "NOT_READY" } } },
  ];
  for (const payload of valid) assert.equal(validateAction(payload), null, payload.action);
});

test("rejects unknown fields and invalid identities", () => {
  assert.match(validateAction({ action: "create_episode", episode: { id: "bad", title: "Test", researchItemId: null } }), /episode id/i);
  assert.match(validateAction({ action: "update_episode_status", episodeId: "EP09", status: "DONE" }), /invalid/i);
  assert.match(validateAction({ action: "save_review", episodeId: "EP09", manifest: { label: "v1", mode: "full", video: {} } }), /identity/i);
  assert.match(validateAction({ action: "create_episode", episode: { id: "EP09", title: "Test", researchItemId: null }, extra: true }), /schema/i);
});

test("episode schema extends the existing governed research and analytics stores", async () => {
  const migration = await readFile(new URL("../migrations/0003_episode_workflow.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS episodes/);
  assert.match(migration, /REFERENCES research_items\(item_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS video_reviews/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS (research_runs|content_publications|content_analytics_snapshots)/);
});

test("Episode Studio assets are in the public allowlist without exposing operational files", () => {
  assert.ok(PUBLIC_FILES.includes("content-os/episodes/index.html"));
  assert.ok(PUBLIC_FILES.includes("content-os/episodes/app.js"));
  assert.ok(!PUBLIC_FILES.includes("migrations/0003_episode_workflow.sql"));
  assert.ok(!PUBLIC_FILES.includes("functions/api/content-os/episode-workflow/index.js"));
});

test("Episode Studio uses the winner-replication recipe for every filming-pack prompt", async () => {
  const app = await readFile(new URL("../content-os/episodes/app.js", import.meta.url), "utf8");
  for (const instruction of [
    "DEFAULT CREATIVE MODE: WINNER-RECIPE REPLICATION",
    "parent emotion -> specific moment -> contradiction / tension -> curiosity -> reframe -> practical action -> save / share takeaway",
    "Do not introduce a new hook structure, storytelling format, pacing pattern, CTA style, or narrative device unless the Founder separately approves it",
    "Do not begin with the mechanism or educational explanation",
    "PRE-FILM HOOK AUDIT",
    "Recognition, Emotional Pull, and Tension / Gap are all satisfied",
    "Do not add another creative variable",
    "Do not manufacture distress",
    "Do not create an SRT file",
  ]) {
    assert.match(app, new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
