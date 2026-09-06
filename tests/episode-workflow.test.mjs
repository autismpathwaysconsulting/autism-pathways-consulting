import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateAction } from "../functions/api/content-os/episode-workflow/index.js";
import { PUBLIC_FILES } from "../scripts/build-site.mjs";
import { MASTER_VIDEO_RULES, masterVideoRulePromptLines } from "../content-os/video-rules.js";

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
  assert.ok(PUBLIC_FILES.includes("content-os/video-rules.js"));
  assert.ok(!PUBLIC_FILES.includes("migrations/0003_episode_workflow.sql"));
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
  assert.doesNotMatch(episodeApp, /DEFAULT CREATIVE MODE: WINNER-RECIPE REPLICATION/);
  assert.doesNotMatch(mainApp, /DEFAULT CREATIVE MODE: WINNER-RECIPE REPLICATION/);
});
