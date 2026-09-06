import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ANALYTICS_CHECKPOINTS } from "../content-os/analytics.js";
import { STATE_SCHEMA_VERSION } from "../content-os/schema.js";
import { MASTER_VIDEO_RULES } from "../content-os/video-rules.js";

async function source(relativePath) {
  return readFile(new URL("../" + relativePath, import.meta.url), "utf8");
}

test("Winner Hook Check is a five-point non-scoring creative gate", async () => {
  const [html, app] = await Promise.all([
    source("content-os/index.html"),
    source("content-os/app.js"),
  ]);

  assert.equal((html.match(/data-hook-check/g) || []).length, 5);
  for (const label of ["Recognition", "Emotional pull", "Tension / gap", "Practical payoff", "Save / share reason"]) {
    assert.match(html, new RegExp(label.replace("/", "\\/"), "i"));
  }
  assert.match(html, /Creative QA only/);
  assert.match(html, /This does not change analytics scoring, the September experiment, or product validation/);
  assert.match(app, /coreChecksPass = checks\.slice\(0, 3\)/);
  assert.match(app, /count >= 4 && coreChecksPass[\s\S]*STRONG ENOUGH TO DEVELOP/);
  assert.match(app, /count >= 3[\s\S]*REWORK OPENING BEFORE FILMING/);
  assert.match(app, /DO NOT FILM YET/);
});

test("winner-versus-recent reference remains an explicit working hypothesis", async () => {
  const html = await source("content-os/index.html");
  assert.match(html, /CURRENT WORKING HYPOTHESIS/);
  assert.match(html, /<table class="pattern-table"/);
  assert.match(html, /Recent APC underperformance may be partly explained/);
  assert.match(html, /This is not a permanent APC rule/);
  for (const phrase of ["Lived parent moment", "Emotional recognition", "Fast curiosity", "Concept first", "Mechanism before recognition", "Practical payoff arrives too late"]) {
    assert.match(html, new RegExp(phrase));
  }
});

test("creative prompts put recognition before mechanism and require the pre-film audit", async () => {
  const [html, app] = await Promise.all([
    source("content-os/index.html"),
    source("content-os/app.js"),
  ]);
  assert.match(html, /value="reel">Reel \/ short-form episode package/);
  for (const instruction of [
    "Begin with \"Can I tell you something?\" followed immediately by one verified statistic or specific number",
    "connect it to a recognisable parent moment",
    "CURIOSITY BRIDGE: At approximately 7 to 12 seconds",
    "Explain one plausible mechanism in plain language",
    "Do not use old HTML script boards",
  ]) {
    assert.ok(
      MASTER_VIDEO_RULES.activeRules.some((line) => line.includes(instruction)),
      `missing active master rule: ${instruction}`,
    );
  }
  for (const instruction of [
    "PRE-FILM HOOK AUDIT",
    "Parent moment:",
    "Primary emotion:",
    "Contradiction / tension:",
    "Why viewer stays:",
    "Practical payoff:",
    "Save/share reason:",
    "PASS only when Recognition, Emotional Pull, and Tension / Gap are all satisfied and at least 4 of the 5 checks are satisfied",
    "one measurement plan for this replicated recipe at the selected checkpoint; do not introduce another creative variable",
  ]) {
    assert.match(app, new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(MASTER_VIDEO_RULES.legacySourcesAllowed, false);
  assert.match(app, /isEpisodeDevelopment = output !== "validation"/);
  assert.match(app, /masterVideoRulePromptLines\(\)/);
  assert.match(app, /save_comment/);
  assert.doesNotMatch(html, /No CTA, let the ending land/);
  assert.doesNotMatch(app, /one measurable experiment for the selected checkpoint/);
});

test("hook capture expands additively while September analytics and state stay unchanged", async () => {
  const [html, schema, analytics] = await Promise.all([
    source("content-os/index.html"),
    source("content-os/schema.js"),
    source("content-os/analytics.js"),
  ]);
  for (const hook of ["Frustration", "Contradiction", "Confusion", "Guilt / parent conflict", "Future worry", "Taboo / rarely discussed", "Surprise", "Relief / reframe", "Other"]) {
    assert.match(html, new RegExp(`<option>${hook.replace("/", "\\/")}</option>`));
    assert.match(schema, new RegExp(hook.replace("/", "\\/")));
    assert.match(analytics, new RegExp(hook.replace("/", "\\/")));
  }
  for (const legacyHook of ["Uncomfortable recognition", "Wait, what?", "Future fear"]) {
    assert.match(schema, new RegExp(legacyHook.replace(/[?]/g, "\\?")));
    assert.match(analytics, new RegExp(legacyHook.replace(/[?]/g, "\\?")));
  }
  assert.equal(STATE_SCHEMA_VERSION, "2.3");
  assert.deepEqual(ANALYTICS_CHECKPOINTS, ["24h", "7d", "28d", "72h_legacy"]);
});
