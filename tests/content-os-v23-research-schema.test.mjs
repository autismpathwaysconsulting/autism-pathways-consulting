import test from "node:test";
import assert from "node:assert/strict";

import {
  RESEARCH_BUNDLE_SCHEMA,
  assertValidResearchBundle,
  validateResearchBundle,
} from "../content-os/research-schema.js";

function completeBundle(overrides = {}) {
  return {
    schema_version: RESEARCH_BUNDLE_SCHEMA,
    run_id: "apc-weekly-topic-review:2026-W36",
    task_id: "apc-weekly-topic-review",
    generated_at: "2026-09-02T01:00:00.000Z",
    status: "complete",
    analytics_context: {
      status: "available",
      summary_run_id: "analytics:2026-W36",
      generated_at: "2026-09-02T00:30:00.000Z",
    },
    sources: [{
      id: "source:official_meta_01",
      name: "Meta official creator guidance",
      url: "https://www.facebook.com/business/help/example",
      published_at: null,
      accessed_at: "2026-09-02T00:40:00.000Z",
      type: "official_platform",
    }],
    findings: [{
      id: "finding:weekly_01",
      title: "Clear first actions may support useful parent education",
      summary: "A bounded candidate finding grounded in the cited source.",
      evidence_status: "candidate_hypothesis",
      source_ids: ["source:official_meta_01"],
      limitations: "This is a content hypothesis, not a clinical conclusion.",
    }],
    topic_candidates: [{
      id: "topic:weekly_01",
      parent_problem: "My child can do the task but cannot get started.",
      hook: "The homework takes 20 minutes. Starting it takes 90.",
      possible_mechanism: "Starting and completing can place different demands on the child.",
      practical_action: "Identify and support the first visible action, then pause.",
      ending: "save",
      series: "What may be making this harder?",
      category: "Task initiation",
      format: "Reel",
      finding_ids: ["finding:weekly_01"],
      confidence: "medium",
      limitations: "Do not assume a single cause.",
      prompt_seed: "Develop this as an APC episode using evidence controls and one practical test.",
    }],
    ...overrides,
  };
}

function noChangeBundle(overrides = {}) {
  return {
    schema_version: RESEARCH_BUNDLE_SCHEMA,
    run_id: "apc-weekly-topic-review:2026-W36",
    task_id: "apc-weekly-topic-review",
    generated_at: "2026-09-02T01:00:00.000Z",
    status: "no_change",
    analytics_context: {
      status: "unavailable",
      summary_run_id: null,
      generated_at: null,
    },
    sources: [],
    findings: [],
    topic_candidates: [],
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

test("a bounded complete weekly research bundle validates", () => {
  const bundle = completeBundle();
  assert.equal(assertValidResearchBundle(bundle), bundle);
  assert.deepEqual(validateResearchBundle(bundle), { valid: true, error: null });
});

test("every append-only research text field rejects identifiers, links, and copied messages", () => {
  const textFields = [
    ["sources[].name", (bundle, leak) => { bundle.sources[0].name = leak; }],
    ["findings[].title", (bundle, leak) => { bundle.findings[0].title = leak; }],
    ["findings[].summary", (bundle, leak) => { bundle.findings[0].summary = leak; }],
    ["findings[].limitations", (bundle, leak) => { bundle.findings[0].limitations = leak; }],
    ["topic_candidates[].parent_problem", (bundle, leak) => { bundle.topic_candidates[0].parent_problem = leak; }],
    ["topic_candidates[].hook", (bundle, leak) => { bundle.topic_candidates[0].hook = leak; }],
    ["topic_candidates[].possible_mechanism", (bundle, leak) => { bundle.topic_candidates[0].possible_mechanism = leak; }],
    ["topic_candidates[].practical_action", (bundle, leak) => { bundle.topic_candidates[0].practical_action = leak; }],
    ["topic_candidates[].series", (bundle, leak) => { bundle.topic_candidates[0].series = leak; }],
    ["topic_candidates[].category", (bundle, leak) => { bundle.topic_candidates[0].category = leak; }],
    ["topic_candidates[].limitations", (bundle, leak) => { bundle.topic_candidates[0].limitations = leak; }],
    ["topic_candidates[].prompt_seed", (bundle, leak) => { bundle.topic_candidates[0].prompt_seed = leak; }],
  ];
  const leaks = [
    ["email", "Contact parent@example.com"],
    ["handle", "DM @parent_handle"],
    ["phone", "Call +60 12 345 6789"],
    ["URL", "See https://example.com/private-message"],
    ["copied message", "Verbatim message: My child needs help today"],
  ];

  for (const [field, setValue] of textFields) {
    for (const [kind, leak] of leaks) {
      const bundle = completeBundle();
      setValue(bundle, leak);
      assert.equal(
        validateResearchBundle(bundle).valid,
        false,
        `${field} accepted ${kind}`,
      );
    }
  }
});

test("research text rejects disguised URL forms and permits ordinary punctuation", () => {
  for (const leak of [
    "Open ftp://example.com/private",
    "Run javascript:alert(1)",
    "Read //example.com/private",
    "Read www.example.com/private",
    "Read example.com/private",
  ]) {
    const bundle = completeBundle();
    bundle.topic_candidates[0].prompt_seed = leak;
    assert.equal(validateResearchBundle(bundle).valid, false, leak);
  }

  const safe = completeBundle();
  safe.sources[0].name = "Meta: creator guidance (official)";
  Object.assign(safe.findings[0], {
    title: "Starting isn’t refusing: a bounded hypothesis",
    summary: "Reviewed 2026-09-02; 2/3 examples used one small step (then paused).",
    limitations: "Observation only - not a clinical conclusion.",
  });
  Object.assign(safe.topic_candidates[0], {
    parent_problem: "Task-initiation / transitions can feel harder than the task.",
    hook: "They know how. Why can’t they begin?",
    possible_mechanism: "Starting & completing may place different demands on a child.",
    practical_action: "Try one step; pause, observe, then ask “What’s next?”",
    series: "What may be making this harder?",
    category: "School & learning (practical tools)",
    limitations: "",
    prompt_seed: "Develop an A/B-test v1.2; keep claims bounded and practical.",
  });
  assert.deepEqual(validateResearchBundle(safe), { valid: true, error: null });
});

test("source.url is the sole research HTTPS exception", () => {
  for (const url of [
    "https://www.facebook.com/business/help/example?ref=safe-token",
    "https://www.youtube.com/@officialcreator/video",
  ]) {
    const bundle = completeBundle();
    bundle.sources[0].url = url;
    assert.doesNotThrow(() => assertValidResearchBundle(bundle), url);
  }

  for (const url of [
    "http://example.com/source",
    "https://author:secret@example.com/source",
    "javascript:alert(1)",
    "data:text/html,private",
    "www.example.com/source",
    "example.com/source",
    "not a URL",
  ]) {
    const bundle = completeBundle();
    bundle.sources[0].url = url;
    assert.throws(() => assertValidResearchBundle(bundle), undefined, url);
  }

  const unsafeSummaryId = completeBundle();
  unsafeSummaryId.analytics_context.summary_run_id = "parent@example.com";
  assert.throws(() => assertValidResearchBundle(unsafeSummaryId), /analytics/);
});

test("no-change runs are explicit and contain no synthetic records", () => {
  assert.doesNotThrow(() => assertValidResearchBundle(noChangeBundle()));
  const invalid = noChangeBundle({ sources: completeBundle().sources });
  assert.throws(() => assertValidResearchBundle(invalid), /no_change/);
});

test("analytics context status requires a coherent summary pair", () => {
  for (const status of ["available", "stale"]) {
    const validGeneratedAt = status === "available"
      ? "2026-09-01T01:00:00.000Z"
      : "2026-08-18T01:00:00.000Z";
    for (const analyticsContext of [
      { status, summary_run_id: null, generated_at: validGeneratedAt },
      { status, summary_run_id: "analytics:2026-W36", generated_at: null },
      { status, summary_run_id: null, generated_at: null },
    ]) {
      assert.throws(
        () => assertValidResearchBundle(completeBundle({ analytics_context: analyticsContext })),
        /summary_run_id and generated_at/,
      );
    }
  }

  assert.doesNotThrow(() => assertValidResearchBundle(completeBundle({
    analytics_context: { status: "unavailable", summary_run_id: null, generated_at: null },
  })));
  for (const analyticsContext of [
    { status: "unavailable", summary_run_id: "analytics:2026-W36", generated_at: null },
    { status: "unavailable", summary_run_id: null, generated_at: "2026-09-01T01:00:00.000Z" },
    { status: "unavailable", summary_run_id: "analytics:2026-W36", generated_at: "2026-09-01T01:00:00.000Z" },
  ]) {
    assert.throws(
      () => assertValidResearchBundle(completeBundle({ analytics_context: analyticsContext })),
      /unavailable analytics must have null/,
    );
  }
});

test("available analytics includes the exact 14-day freshness boundary", () => {
  const exactlyFourteenDays = completeBundle({
    analytics_context: {
      status: "available",
      summary_run_id: "analytics:2026-W34",
      generated_at: "2026-08-19T01:00:00.000Z",
    },
  });
  assert.doesNotThrow(() => assertValidResearchBundle(exactlyFourteenDays));

  const oneMillisecondOlder = completeBundle({
    analytics_context: {
      status: "available",
      summary_run_id: "analytics:2026-W34",
      generated_at: "2026-08-19T00:59:59.999Z",
    },
  });
  assert.throws(() => assertValidResearchBundle(oneMillisecondOlder), /no more than 14 days old/);
});

test("stale analytics must be older than 14 days and never future-dated", () => {
  const justOlderThanFourteenDays = completeBundle({
    analytics_context: {
      status: "stale",
      summary_run_id: "analytics:2026-W34",
      generated_at: "2026-08-19T00:59:59.999Z",
    },
  });
  assert.doesNotThrow(() => assertValidResearchBundle(justOlderThanFourteenDays));

  for (const analyticsContext of [
    {
      status: "stale",
      summary_run_id: "analytics:2026-W34",
      generated_at: "2026-08-19T01:00:00.000Z",
    },
    {
      status: "stale",
      summary_run_id: "analytics:2026-W36",
      generated_at: "2026-09-01T01:00:00.000Z",
    },
  ]) {
    assert.throws(
      () => assertValidResearchBundle(completeBundle({ analytics_context: analyticsContext })),
      /more than 14 days old/,
    );
  }

  for (const status of ["available", "stale"]) {
    const future = completeBundle({
      analytics_context: {
        status,
        summary_run_id: "analytics:2026-W36",
        generated_at: "2026-09-02T01:00:00.001Z",
      },
    });
    assert.throws(() => assertValidResearchBundle(future), /must not be in the future/);
  }
});

test("only the approved producer and weekly run ID are accepted", () => {
  assert.throws(
    () => assertValidResearchBundle(completeBundle({ task_id: "unapproved-task" })),
    /approved producer/,
  );
  assert.throws(
    () => assertValidResearchBundle(completeBundle({ run_id: "random:2026-W36" })),
    /weekly task ID/,
  );
  assert.throws(
    () => assertValidResearchBundle(completeBundle({ run_id: "apc-weekly-topic-review:2026-36" })),
    /weekly task ID/,
  );
});

test("weekly run identity follows the APC timezone at ISO year boundaries", () => {
  const unavailableAnalytics = {
    status: "unavailable",
    summary_run_id: null,
    generated_at: null,
  };
  assert.doesNotThrow(() => assertValidResearchBundle(completeBundle({
    run_id: "apc-weekly-topic-review:2026-W01",
    generated_at: "2025-12-28T16:30:00.000Z",
    analytics_context: unavailableAnalytics,
  })));
  assert.doesNotThrow(() => assertValidResearchBundle(completeBundle({
    run_id: "apc-weekly-topic-review:2026-W02",
    generated_at: "2026-01-04T16:00:00.000Z",
    analytics_context: unavailableAnalytics,
  })));
  assert.throws(() => assertValidResearchBundle(completeBundle({
    run_id: "apc-weekly-topic-review:2025-W52",
    generated_at: "2025-12-28T16:30:00.000Z",
    analytics_context: unavailableAnalytics,
  })), /must match the generated_at ISO week/);
  assert.throws(() => assertValidResearchBundle(completeBundle({
    run_id: "apc-weekly-topic-review:2026-W01",
    generated_at: "2026-01-04T16:00:00.000Z",
    analytics_context: unavailableAnalytics,
  })), /must match the generated_at ISO week/);
});

test("UTC timestamps reject impossible dates before temporal comparisons", () => {
  for (const timestamp of [
    "2023-02-29T12:00:00.000Z",
    "2026-02-31T12:00:00.000Z",
    "2026-13-01T12:00:00.000Z",
    "2026-09-02T24:00:00.000Z",
  ]) {
    const bundle = completeBundle();
    bundle.sources[0].published_at = timestamp;
    assert.throws(() => assertValidResearchBundle(bundle), /real UTC ISO timestamp|UTC ISO timestamp/, timestamp);
  }

  for (const leapTimestamp of [
    "2024-02-29T12:34:56.000Z",
    "2024-02-29T12:34:56Z",
  ]) {
    const bundle = completeBundle();
    bundle.sources[0].published_at = leapTimestamp;
    assert.doesNotThrow(() => assertValidResearchBundle(bundle), leapTimestamp);
  }

  const impossibleBundleTime = completeBundle({
    generated_at: "2026-09-31T01:00:00.000Z",
  });
  assert.throws(() => assertValidResearchBundle(impossibleBundleTime), /real UTC ISO timestamp/);

  const impossibleSummaryTime = completeBundle({
    analytics_context: {
      status: "available",
      summary_run_id: "analytics:2026-W36",
      generated_at: "2026-08-32T01:00:00.000Z",
    },
  });
  assert.throws(() => assertValidResearchBundle(impossibleSummaryTime), /UTC ISO timestamp/);
});

test("source and finding references must exist and IDs must be unique", () => {
  const unknownSource = completeBundle();
  unknownSource.findings[0].source_ids = ["source:missing_01"];
  assert.throws(() => assertValidResearchBundle(unknownSource), /unknown source/);

  const unknownFinding = completeBundle();
  unknownFinding.topic_candidates[0].finding_ids = ["finding:missing_01"];
  assert.throws(() => assertValidResearchBundle(unknownFinding), /unknown finding/);

  const duplicateSources = completeBundle();
  duplicateSources.sources.push(clone(duplicateSources.sources[0]));
  assert.throws(() => assertValidResearchBundle(duplicateSources), /source IDs must be unique/);
});

test("research cannot silently promote a finding into an APC rule", () => {
  const bundle = completeBundle();
  bundle.findings[0].evidence_status = "approved_rule";
  assert.throws(() => assertValidResearchBundle(bundle), /evidence_status/);

  const extraAuthority = completeBundle();
  extraAuthority.topic_candidates[0].auto_approve = true;
  assert.throws(() => assertValidResearchBundle(extraAuthority), /auto_approve/);
});

test("research schema rejects private identifiers and unexpected content fields", () => {
  const mutations = [
    bundle => { bundle.findings[0].summary = "Parent said to email parent@example.com"; },
    bundle => { bundle.findings[0].summary = "Message @parent_handle"; },
    bundle => { bundle.topic_candidates[0].parent_problem = "Call +60 12 345 6789"; },
    bundle => { bundle.comment_text = "Full comment"; },
    bundle => { bundle.topic_candidates[0].dm_content = "Private DM"; },
    bundle => { bundle.followers = []; },
  ];
  for (const mutate of mutations) {
    const bundle = completeBundle();
    mutate(bundle);
    assert.equal(validateResearchBundle(bundle).valid, false);
  }
});

test("research schema rejects prototype keys and inherited objects", () => {
  const ownKey = completeBundle();
  Object.defineProperty(ownKey.findings[0], "constructor", { value: {}, enumerable: true });
  assert.equal(validateResearchBundle(ownKey).valid, false);

  const inherited = completeBundle();
  const source = Object.create({ hidden: true });
  Object.assign(source, inherited.sources[0]);
  inherited.sources[0] = source;
  assert.equal(validateResearchBundle(inherited).valid, false);
  assert.equal({}.polluted, undefined);
});
