import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PUBLIC_FILES } from "../scripts/build-site.mjs";
import {
  CJ_IDEA_BACKLOG,
  CJ_IDEA_BACKLOG_VERSION,
  MASTER_TOPIC_BANK,
  MASTER_TOPIC_BANK_VERSION,
} from "../content-os/topic-bank.js";

async function source(relativePath) {
  return readFile(new URL("../" + relativePath, import.meta.url), "utf8");
}

test("future idea bank is rebuilt for the current master and teenage audience", () => {
  assert.equal(MASTER_TOPIC_BANK_VERSION, "2026-09-06.1");
  assert.ok(MASTER_TOPIC_BANK.length >= 12);
  assert.equal(new Set(MASTER_TOPIC_BANK.map(topic => topic.id)).size, MASTER_TOPIC_BANK.length);

  for (const topic of MASTER_TOPIC_BANK) {
    assert.match(topic.id, /^[a-z0-9-]+$/);
    assert.ok(topic.hook.startsWith("Can I tell you something?"), topic.id);
    assert.match(topic.hook, /\d/, topic.id);
    assert.ok(["Puberty / early adolescence", "Teen years", "Preparing to leave school"].includes(topic.stage), topic.id);
    assert.ok(topic.overlay.length > 10, topic.id);
    assert.ok(topic.parentMoment.length > 20, topic.id);
    assert.ok(topic.tension.length > 20, topic.id);
    assert.ok(topic.practicalPayoff.length > 20, topic.id);
    assert.match(topic.source.url, /^https:\/\//, topic.id);
    assert.ok(Number.isSafeInteger(topic.source.year), topic.id);
    assert.ok(topic.source.scope.length > 30, topic.id);
  }
});

test("old static idea bank is removed from active Content OS source", async () => {
  const app = await source("content-os/app.js");
  assert.match(app, /topics: MASTER_TOPIC_BANK/);
  assert.doesNotMatch(app, /Behaviour, meltdowns & overwhelm/);
  assert.doesNotMatch(app, /They eat chicken nuggets/);
  assert.doesNotMatch(app, /Should I remove gluten/);
});

test("selecting a master idea carries its evidence into the production prompt", async () => {
  const [app, html, episodeApp, episodeHtml] = await Promise.all([
    source("content-os/app.js"),
    source("content-os/index.html"),
    source("content-os/episodes/app.js"),
    source("content-os/episodes/index.html"),
  ]);
  assert.match(app, /function masterTopicContext\(topic\)/);
  assert.match(app, /selectedResearchContext = masterTopicContext/);
  assert.match(app, /"SELECTED EVIDENCE CONTEXT"/);
  assert.match(app, /Master topic bank: /);
  assert.match(app, /Evidence: /);
  assert.match(html, /Selected evidence context/);
  assert.match(episodeApp, /function renderMasterIdeas\(\)/);
  assert.match(episodeApp, /sourceType: "master-topic-bank"/);
  assert.match(episodeApp, /JSON\.stringify\(evidenceContext, null, 2\)/);
  assert.match(episodeHtml, /Master-aligned ideas/);
});

test("master topic bank is published with Content OS", () => {
  assert.ok(PUBLIC_FILES.includes("content-os/topic-bank.js"));
});

test("CJ idea backlog preserves new ideas as unverified inspiration", () => {
  assert.equal(CJ_IDEA_BACKLOG_VERSION, "2026-09-06.1");
  assert.ok(CJ_IDEA_BACKLOG.length >= 40);
  assert.equal(new Set(CJ_IDEA_BACKLOG.map(topic => topic.id)).size, CJ_IDEA_BACKLOG.length);

  const requiredIdeas = [
    "Stem cells and autism",
    "Opinions on ABA",
    "Phrases that work at home",
    "Phrases that build language",
    "Sports",
    "Expectations",
    "Responsibilities at home",
    "Applying parenting techniques to autistic children",
    "Autism and the OKU card",
    "Should classrooms have security cameras?",
  ];
  for (const name of requiredIdeas) {
    assert.ok(CJ_IDEA_BACKLOG.some(topic => topic.name === name), name);
  }

  for (const topic of CJ_IDEA_BACKLOG) {
    assert.match(topic.id, /^[a-z0-9-]+$/);
    assert.ok(topic.brief.length > 20, topic.id);
    assert.ok(topic.gate.length > 10, topic.id);
    assert.ok(Array.isArray(topic.references), topic.id);
    assert.ok(topic.references.every(url => /^https:\/\//.test(url)), topic.id);
    assert.equal(Object.hasOwn(topic, "source"), false, topic.id);
  }
});

test("CJ backlog builds a research-gated development prompt", async () => {
  const [app, html] = await Promise.all([
    source("content-os/app.js"),
    source("content-os/index.html"),
  ]);
  assert.match(app, /ideaBacklog: CJ_IDEA_BACKLOG/);
  assert.match(app, /function backlogTopicContext\(topic\)/);
  assert.match(app, /verificationStatus: "research-required"/);
  assert.match(app, /Inspiration links are not governed evidence/);
  assert.match(app, /function buildDevelopmentPromptFromBacklog\(topic\)/);
  assert.match(app, /buildDevelopmentPromptFromBacklog\(topic\)/);
  assert.match(app, /RESEARCH GATE/);
  assert.match(html, /Ready ideas \+ CJ backlog/);
});

test("idea actions build a copy-ready script prompt without another required click", async () => {
  const [app, html, episodeApp, episodeHtml] = await Promise.all([
    source("content-os/app.js"),
    source("content-os/index.html"),
    source("content-os/episodes/app.js"),
    source("content-os/episodes/index.html"),
  ]);

  assert.match(app, /function buildScriptPromptFromTopic\(topic, stage, family, area, bankTopic\)/);
  assert.match(app, /element\("pOutput"\)\.value = "reel";\s*await createTrackedEpisodePrompt\(\);/);
  assert.match(app, /buildScriptPromptFromTopic\(topic\.hook, topic\.stage, topic\.family, topic\.name, topic\)/);
  assert.match(app, /item\.type === "topic"[\s\S]*await createTrackedEpisodePrompt\(\);/);
  assert.match(app, /episodeWorkflow: "\/api\/content-os\/episode-workflow"/);
  assert.match(app, /action: "create_tracked_prompt"/);
  assert.match(app, /element\("builtPrompt"\)\.hidden = true/);
  assert.match(html, /Ready ideas include governed evidence/);

  assert.match(episodeApp, /async function createEpisodeAndBuildPrompt\(episode, sourceContext\)/);
  assert.match(episodeApp, /element\("packEpisode"\)\.value = episode\.id;/);
  assert.match(episodeApp, /action: "create_tracked_prompt"/);
  assert.match(episodeApp, /element\("promptOutput"\)\.textContent = prompt\.text/);
  assert.match(episodeApp, /createEpisodeAndBuildPrompt\(\{ id: nextEpisodeId\(\), title: topic\.name, researchItemId: null \}, masterContext\(topic\)\)/);
  assert.match(episodeApp, /"Create episode \+ build prompt"/);
  assert.match(episodeHtml, />Create episode \+ build prompt</);
  assert.match(episodeHtml, />Copy prompt</);
});
