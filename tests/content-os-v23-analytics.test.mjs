import test from "node:test";
import assert from "node:assert/strict";

import {
  ANALYTICS_CHECKPOINTS,
  ANALYTICS_METRICS,
  ANALYTICS_PROTOCOL_VERSION,
  ANALYTICS_SCHEMA_VERSION,
  assertValidAnalyticsSnapshot,
  assertValidPublication,
  comparableSnapshots,
  isCanonicalUtcTimestamp,
  median,
  safeRate,
  validateAnalyticsSubmission,
} from "../content-os/analytics.js";

function publication(overrides = {}) {
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    publicationId: "pub_apc-episode-09",
    episodeId: "EP09",
    platform: "Instagram",
    postRef: "https://www.instagram.com/reel/valid123/",
    publishedAt: "2026-09-01T03:00:00.000Z",
    title: "Starting is a separate demand",
    topic: "Homework initiation",
    problemArea: "Task initiation",
    productFamily: "Make School & Learning Work",
    format: "Reel",
    durationSeconds: 42,
    slideCount: null,
    hookType: "Contradiction",
    creativeVersion: "EP09-v1",
    ctaType: "save",
    experimentType: "Discovery post",
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const metrics = {
    views: 1_000,
    reach: 800,
    averageWatchTimeSeconds: null,
    totalWatchTimeSeconds: null,
    likes: 50,
    commentsCount: 10,
    saves: 20,
    shares: 15,
  };
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    snapshotId: "snap_apc-episode-09-24h",
    publicationId: "pub_apc-episode-09",
    checkpoint: "24h",
    protocolVersion: ANALYTICS_PROTOCOL_VERSION,
    capturedAt: "2026-09-02T03:00:00.000Z",
    metrics,
    missingReasons: Object.fromEntries(ANALYTICS_METRICS.map(key => [
      key,
      metrics[key] === null ? "not_shown_in_source" : null,
    ])),
    signals: {
      substantiveCommentsCount: 2,
      dmProblemCount: 1,
      requestCount: 0,
      interestCount: 0,
      paidCount: 0,
    },
    deidentifiedThemeSummary: "Parents recognised the difficulty of beginning the first visible action.",
    collectionMethod: "manual",
    sourceSystem: "Instagram Insights",
    sourceMetricVersion: "meta-ui-2026-09",
    ...overrides,
  };
}

function submission(overrides = {}) {
  return {
    publication: publication(),
    snapshot: snapshot(),
    idempotencyKey: "ig:EP09:24h:2026-09-02",
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

test("manual analytics accepts the exact aggregate-only contract", () => {
  const value = submission();
  assert.equal(assertValidPublication(value.publication), value.publication);
  assert.equal(assertValidAnalyticsSnapshot(value.snapshot), value.snapshot);
  assert.deepEqual(validateAnalyticsSubmission(value), { valid: true, error: null });
});

test("analytics timestamps require real canonical UTC calendar values", () => {
  for (const value of [
    "2024-02-29T23:59:59Z",
    "2024-02-29T23:59:59.000Z",
    "2026-09-02T03:04:05.123Z",
  ]) {
    assert.equal(isCanonicalUtcTimestamp(value), true, value);
  }

  for (const value of [
    "2025-02-29T03:00:00.000Z",
    "2026-02-31T03:00:00.000Z",
    "2026-13-01T03:00:00.000Z",
    "2026-00-01T03:00:00.000Z",
    "2026-09-00T03:00:00.000Z",
    "2026-09-01T24:00:00.000Z",
    "2026-09-01T03:60:00.000Z",
    "2026-09-01T03:00:60.000Z",
    "2026-09-01 03:00:00Z",
    "2026-09-01T03:00:00+00:00",
  ]) {
    assert.equal(isCanonicalUtcTimestamp(value), false, value);
  }

  assert.throws(
    () => assertValidPublication(publication({ publishedAt: "2025-02-29T03:00:00.000Z" })),
    /publishedAt/,
  );
  assert.throws(
    () => assertValidAnalyticsSnapshot(snapshot({ capturedAt: "2026-02-31T03:00:00.000Z" })),
    /capturedAt/,
  );
});

test("every append-only analytics text field rejects identifiers, links, and copied messages", () => {
  const textFields = [
    ["publication.episodeId", (value, leak) => { value.publication.episodeId = leak; }],
    ["publication.title", (value, leak) => { value.publication.title = leak; }],
    ["publication.topic", (value, leak) => { value.publication.topic = leak; }],
    ["publication.problemArea", (value, leak) => { value.publication.problemArea = leak; }],
    ["publication.productFamily", (value, leak) => { value.publication.productFamily = leak; }],
    ["publication.creativeVersion", (value, leak) => { value.publication.creativeVersion = leak; }],
    ["publication.ctaType", (value, leak) => { value.publication.ctaType = leak; }],
    ["snapshot.protocolVersion", (value, leak) => { value.snapshot.protocolVersion = leak; }],
    ["snapshot.deidentifiedThemeSummary", (value, leak) => { value.snapshot.deidentifiedThemeSummary = leak; }],
    ["snapshot.sourceMetricVersion", (value, leak) => { value.snapshot.sourceMetricVersion = leak; }],
  ];
  const leaks = [
    ["email", "Contact parent@example.com"],
    ["handle", "DM @parent_handle"],
    ["phone", "Call +60 12 345 6789"],
    ["URL", "See https://example.com/private-message"],
    ["copied message", "Copied DM: My child needs help today"],
  ];

  for (const [field, setValue] of textFields) {
    for (const [kind, leak] of leaks) {
      const value = clone(submission());
      setValue(value, leak);
      assert.equal(
        validateAnalyticsSubmission(value).valid,
        false,
        `${field} accepted ${kind}`,
      );
    }
  }
});

test("analytics text rejects disguised URL forms and permits ordinary punctuation", () => {
  for (const leak of [
    "Open ftp://example.com/private",
    "Run javascript:alert(1)",
    "Read //example.com/private",
    "Read www.example.com/private",
    "Read example.com/private",
  ]) {
    const value = submission();
    value.snapshot.deidentifiedThemeSummary = leak;
    assert.equal(validateAnalyticsSubmission(value).valid, false, leak);
  }

  const safe = submission();
  Object.assign(safe.publication, {
    episodeId: "EP09-v1.2",
    title: "Starting isn’t refusing: try one step (then pause).",
    topic: "Task-initiation / transitions",
    problemArea: "School & learning",
    productFamily: "Everyday life (practical tools)",
    creativeVersion: "A/B-test v1.2",
    ctaType: "Save/share if useful; no pressure.",
  });
  Object.assign(safe.snapshot, {
    protocolVersion: "APC-META-2026-09",
    deidentifiedThemeSummary: "Reviewed 2026-09-02: parents recognised ‘start small’; 2/3 tried it.",
    sourceMetricVersion: "meta-ui-2026-09 (manual)",
  });
  assert.deepEqual(validateAnalyticsSubmission(safe), { valid: true, error: null });
});

test("postRef is the sole analytics HTTPS-or-stable-ID exception", () => {
  for (const postRef of [
    "https://www.instagram.com/reel/valid123/?igsh=safe-token",
    "https://www.tiktok.com/@apc/video/1234567890123456789",
    "legacy-post-id",
    "123456789012345678",
  ]) {
    assert.doesNotThrow(() => assertValidPublication(publication({ postRef })), postRef);
  }

  for (const postRef of [
    "http://example.com/post",
    "https://parent:secret@example.com/post",
    "javascript:alert(1)",
    "data:text/html,private",
    "//example.com/post",
    "www.example.com/post",
    "example.com/post",
    "parent@example.com",
    "@parent_handle",
    "+60 12 345 6789",
    "Copied message from a parent",
  ]) {
    assert.throws(() => assertValidPublication(publication({ postRef })), undefined, postRef);
  }
});

test("24h, 7d, and 28d are canonical while 72h is explicitly legacy", () => {
  assert.deepEqual(ANALYTICS_CHECKPOINTS, ["24h", "7d", "28d", "72h_legacy"]);
  for (const checkpoint of ANALYTICS_CHECKPOINTS) {
    assert.doesNotThrow(() => assertValidAnalyticsSnapshot(snapshot({ checkpoint })));
  }
  for (const checkpoint of ["72h", "1d", "week", "30d", "7D"]) {
    assert.throws(() => assertValidAnalyticsSnapshot(snapshot({ checkpoint })), /checkpoint/);
  }
});

test("null is preserved, zero is data, and a null metric requires a reason", () => {
  const value = snapshot();
  assert.equal(value.metrics.averageWatchTimeSeconds, null);
  assert.equal(value.metrics.totalWatchTimeSeconds, null);
  assert.doesNotThrow(() => assertValidAnalyticsSnapshot(value));

  const zero = snapshot();
  zero.metrics.saves = 0;
  zero.missingReasons.saves = null;
  assert.doesNotThrow(() => assertValidAnalyticsSnapshot(zero));

  const missingReason = snapshot();
  missingReason.missingReasons.averageWatchTimeSeconds = null;
  assert.throws(() => assertValidAnalyticsSnapshot(missingReason), /averageWatchTimeSeconds/);

  const reasonOnValue = snapshot();
  reasonOnValue.missingReasons.views = "not_collected";
  assert.throws(() => assertValidAnalyticsSnapshot(reasonOnValue), /must be null when a metric is reported/);
});

test("average watch time accepts a finite non-negative decimal from Meta", () => {
  const value = snapshot();
  value.metrics.averageWatchTimeSeconds = 12.5;
  value.missingReasons.averageWatchTimeSeconds = null;
  assert.doesNotThrow(() => assertValidAnalyticsSnapshot(value));
});

test("views and reach use separate denominators and cannot be replaced by a combined field", () => {
  const value = snapshot();
  assert.equal(value.metrics.views, 1_000);
  assert.equal(value.metrics.reach, 800);
  assert.equal(safeRate(value.metrics.saves, value.metrics.views), 20);
  assert.equal(safeRate(value.metrics.saves, value.metrics.reach), 25);

  const combined = snapshot();
  combined.metrics.reachOrViews = 1_000;
  assert.throws(() => assertValidAnalyticsSnapshot(combined), /reachOrViews/);
});

test("rate and median calculations never turn missing data into zero", () => {
  assert.equal(safeRate(null, 100), null);
  assert.equal(safeRate(10, null), null);
  assert.equal(safeRate(10, 0), null);
  assert.equal(safeRate(-1, 100), null);
  assert.equal(safeRate(10, 100), 100);
  assert.equal(median([null, undefined, Number.NaN]), null);
  assert.equal(median([null, 1, 9, undefined, 5]), 5);
  assert.equal(median([2, 8, 4, 6]), 5);
});

test("comparables match platform, format, checkpoint, and protocol only", () => {
  const target = {
    snapshotId: "target",
    platform: "Instagram",
    format: "Reel",
    checkpoint: "24h",
    protocolVersion: ANALYTICS_PROTOCOL_VERSION,
  };
  const matching = { ...target, snapshotId: "matching" };
  const records = [
    target,
    matching,
    { ...matching, snapshotId: "platform", platform: "TikTok" },
    { ...matching, snapshotId: "format", format: "Carousel" },
    { ...matching, snapshotId: "checkpoint", checkpoint: "7d" },
    { ...matching, snapshotId: "protocol", protocolVersion: "old" },
  ];
  assert.deepEqual(comparableSnapshots(records, target), [matching]);
});

test("analytics rejects private content, unsafe links, unknown keys, and mismatched IDs", () => {
  const privateCases = [
    value => { value.snapshot.commentText = "A parent quote"; },
    value => { value.snapshot.username = "parent_handle"; },
    value => { value.snapshot.caption = "Full caption"; },
    value => { value.snapshot.followerList = []; },
    value => { value.snapshot.deidentifiedThemeSummary = "Contact parent@example.com"; },
    value => { value.snapshot.deidentifiedThemeSummary = "DM @parent_handle"; },
    value => { value.snapshot.deidentifiedThemeSummary = "Call +60 12 345 6789"; },
  ];
  for (const mutate of privateCases) {
    const value = clone(submission());
    mutate(value);
    assert.equal(validateAnalyticsSubmission(value).valid, false);
  }

  const unsafeUrl = submission();
  unsafeUrl.publication.postRef = "javascript:alert(1)";
  assert.equal(validateAnalyticsSubmission(unsafeUrl).valid, false);

  const credentials = submission();
  credentials.publication.postRef = "https://user:password@example.com/post";
  assert.equal(validateAnalyticsSubmission(credentials).valid, false);

  const mismatch = submission();
  mismatch.snapshot.publicationId = "pub_another-episode";
  assert.match(validateAnalyticsSubmission(mismatch).error, /do not match/);
});

test("analytics rejects prototype keys and inherited records", () => {
  const ownPrototypeKey = submission();
  Object.defineProperty(ownPrototypeKey.snapshot.metrics, "prototype", { value: {}, enumerable: true });
  assert.equal(validateAnalyticsSubmission(ownPrototypeKey).valid, false);

  const inherited = submission();
  const metrics = Object.create({ views: 999 });
  Object.assign(metrics, inherited.snapshot.metrics);
  inherited.snapshot.metrics = metrics;
  assert.equal(validateAnalyticsSubmission(inherited).valid, false);
  assert.equal({}.polluted, undefined);
});
