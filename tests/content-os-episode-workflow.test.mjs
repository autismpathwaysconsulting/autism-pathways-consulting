import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { MINIMUM_REDTEAM_PASS_SCORE, validateAction } from "../functions/api/content-os/episode-workflow/index.js";
import { PUBLIC_FILES } from "../scripts/build-site.mjs";
import { MASTER_VIDEO_RULES, masterVideoRulePromptLines } from "../content-os/video-rules.js";

const masterRules = {
  version: "2026-09-06.1",
  sha256: "8".repeat(64),
  sourcePath: "02_CONTENT_SYSTEM/APC_Video_Rules_and_Winning_Examples.md",
};

function importedPack(overrides = {}) {
  return {
    schemaVersion: "apc.episode_pack.v2",
    episodeId: "EP09",
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

test("accepts the governed and tracked episode workflow actions", () => {
  const hash = "a".repeat(64);
  const valid = [
    { action: "create_episode", episode: { id: "EP09", title: "A useful episode", researchItemId: null } },
    { action: "create_tracked_prompt", episode: { id: "EP09", title: "A useful episode", researchItemId: null }, prompt: { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Line one\nLine two", sourceContext: { sourceType: "manual" }, masterRules }, idempotencyKey: "prompt:EP09:12345678" },
    { action: "save_prompt_revision", episodeId: "EP09", prompt: { schemaVersion: "apc.episode_prompt.v1", format: "Talking head", notes: "", text: "Revised prompt", sourceContext: { sourceType: "manual" }, masterRules }, idempotencyKey: "prompt-revision:EP09:12345678" },
    { action: "import_production_pack", episodeId: "EP09", pack: importedPack(), idempotencyKey: "pack:EP09:12345678" },
    { action: "lock_script", episodeId: "EP09", idempotencyKey: "lock:EP09:12345678" },
    { action: "update_episode_details", episodeId: "EP09", title: "A revised useful episode", displayNumber: 2, idempotencyKey: "episode-edit:EP09:12345678" },
    { action: "set_episode_archived", episodeId: "EP09", archived: true, idempotencyKey: "archive:EP09:12345678" },
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
  assert.match(validateAction({ action: "update_episode_details", episodeId: "EP09", title: "Test", displayNumber: 2.5, idempotencyKey: "episode-edit:EP09:12345678" }), /whole number/i);
});

test("episode schema extends the existing governed research and analytics stores", async () => {
  const migration = await readFile(new URL("../migrations/0003_episode_workflow.sql", import.meta.url), "utf8");
  const trackingMigration = await readFile(new URL("../migrations/0005_episode_tracking.sql", import.meta.url), "utf8");
  const managementMigration = await readFile(new URL("../migrations/0006_episode_management.sql", import.meta.url), "utf8");
  const privateNumberMigration = await readFile(new URL("../migrations/0010_private_episode_number.sql", import.meta.url), "utf8");
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
});

test("tracked package contract requires the red-team and five-check filming gate", () => {
  assert.equal(MINIMUM_REDTEAM_PASS_SCORE, 8.5);
  const failedRedTeam = importedPack({ redteam: { result: "FAIL", score: 4, risks: ["Overclaim"], fixes: [] }, finalDecision: "REVISE" });
  assert.equal(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: failedRedTeam, idempotencyKey: "pack:EP09:failed001" }), null);

  const mismatchedChecks = importedPack({ hookGate: { result: "PASS", yesCount: 5, checks: [true, true, true, false, false] } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: mismatchedChecks, idempotencyKey: "pack:EP09:badchecks" }), /hook gate/i);

  const wrongScoreScale = importedPack({ redteam: { result: "PASS", score: 95, risks: [], fixes: [] } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: wrongScoreScale, idempotencyKey: "pack:EP09:badscore1" }), /between 0 and 10/i);

  const weakPass = importedPack({ redteam: { result: "PASS", score: 8.4, risks: [], fixes: [] } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: weakPass, idempotencyKey: "pack:EP09:weakpass1" }), /at least 8\.5\/10/i);
});

test("tracked package contract supports backward-compatible scene preparation and carousel packs", () => {
  assert.equal(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: carouselPack(), idempotencyKey: "pack:EP09:carousel1" }), null);
  const missingSlides = carouselPack({ carousel: { slides: [], designNotes: [], caption: "Caption" } });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: missingSlides, idempotencyKey: "pack:EP09:carousel2" }), /carousel/i);
  const videoWithCarouselDecision = importedPack({ contentType: "VIDEO", finalDecision: "PRODUCE" });
  assert.match(validateAction({ action: "import_production_pack", episodeId: "EP09", pack: videoWithCarouselDecision, idempotencyKey: "pack:EP09:video0001" }), /video pack/i);
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
  assert.match(episodeHtml, /Validate \+ import package/);
  assert.match(episodeHtml, /red-team score of at least 8\.5\/10/);
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
  assert.match(episodeApp, /existing item\(s\) skipped/);
  assert.match(episodeApp, /renderFilmingPackSwitcher/);
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
  assert.match(mainApp, /already tracks this idea/);
  assert.match(mainHtml, /Publish \+ schedule analytics/);
  assert.match(mainHtml, /id="trackPublicationButton"/);
  assert.match(mainHtml, /Step 1 · Ready ideas \+ CJ backlog/);
  assert.match(mainHtml, /Step 2<\/p><h2 id="prompts-title">Build and track the episode/);
  assert.match(mainHtml, /Step 5<\/p><h2 id="analytics-title">Publish and collect episode performance/);
});
