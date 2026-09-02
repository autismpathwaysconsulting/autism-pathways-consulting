import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_STATE_BYTES,
  MAX_CALENDAR_ENTRIES,
  LEGACY_STARTER_CALENDAR,
  METRIC_KEYS,
  STATE_SCHEMA_VERSION,
  assertValidContentOsState,
  defaultContentOsState,
  migrateContentOsState,
  validateContentOsState,
} from "../content-os/schema.js";

function missingReasons(metrics, reason = "not_collected") {
  return Object.fromEntries(METRIC_KEYS.map(key => [key, metrics[key] === null ? reason : null]));
}

function validResult(overrides = {}) {
  const metrics = {
    views: 1_000,
    reach: 800,
    watchTimeSeconds: null,
    averageWatchTimeSeconds: null,
    likes: 50,
    comments: 10,
    saves: 20,
    shares: 15,
  };
  const result = {
    id: 1,
    topic: "Starting homework can be a separate demand",
    area: "Task initiation",
    family: "Make School & Learning Work",
    platform: "Instagram",
    date: "2026-09-01",
    snapshot: "24h",
    experiment: "Discovery post",
    postId: "https://www.instagram.com/p/valid123/",
    format: "Reel",
    hookType: "Contradiction",
    length: "42 sec",
    version: "EP09-v1",
    metrics,
    missingReasons: missingReasons(metrics),
    signals: {
      substantiveComments: 2,
      dms: 1,
      requests: 0,
      interest: 0,
      paid: 0,
    },
    metricSource: "manual_meta",
    recordedAt: "2026-09-02T01:02:03.000Z",
    cta: "Save this for the next difficult homework day",
    patternSummary: "Parents recognised difficulty beginning the first visible action.",
    legacyMetricAmbiguity: false,
    ...overrides,
  };
  return result;
}

function validCalendarEntry(overrides = {}) {
  return {
    status: "posted",
    topic: "Starting homework can be a separate demand",
    area: "Task initiation",
    family: "Make School & Learning Work",
    stage: "Growing independence",
    ...overrides,
  };
}

function validState(overrides = {}) {
  return {
    ...defaultContentOsState(),
    calendar: { "2026-09-01": validCalendarEntry() },
    results: [validResult()],
    book: [{
      id: 10,
      title: "Starting is a separate demand",
      section: "They know how. Why can’t they do it?",
      stage: "Growing independence",
      family: "Make School & Learning Work",
      notes: "APC-authored chapter note.",
    }],
    updatedAt: "2026-09-02T01:02:03.000Z",
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

function validLegacyState(version = "2.1") {
  return {
    version,
    calendar: { "2026-09-01": { status: "posted" } },
    results: [{
      id: 7,
      topic: "Legacy post",
      area: "Task initiation",
      family: "Make School & Learning Work",
      platform: "Instagram",
      date: "2026-09-01",
      snapshot: "72h",
      experiment: "Discovery post",
      postId: "legacy-post-id",
      format: "Reel",
      hookType: "Contradiction",
      length: "40 sec",
      version: "legacy-v1",
      reach: 900,
      saves: 18,
      shares: 9,
      comments: 4,
      dms: 2,
      requests: 1,
      interest: 0,
      paid: 0,
      cta: "Save",
      notes: "Deidentified legacy theme",
    }],
    products: {},
    book: [{
      id: 12,
      title: "A legacy chapter",
      section: "School and learning",
      stage: "Growing independence",
      family: "Make School & Learning Work",
      notes: "A deidentified planning note.",
    }],
    lastBackupAt: null,
    lastBackupResultCount: 1,
    updatedAt: "2026-09-02T01:02:03.000Z",
  };
}

test("the canonical v2.3 state validates without coercion", () => {
  const state = validState();
  assert.equal(STATE_SCHEMA_VERSION, "2.3");
  assert.equal(assertValidContentOsState(state), state);
  assert.deepEqual(validateContentOsState(state), { valid: true, error: null });
  assert.equal(state.results[0].metrics.views, 1_000);
  assert.equal(state.results[0].metrics.reach, 800);
  assert.equal(state.results[0].metrics.watchTimeSeconds, null);
});

test("planning timestamps reject normalized impossible dates", () => {
  for (const value of [
    "2026-02-31T01:02:03.000Z",
    "2026-13-01T01:02:03.000Z",
    "2025-02-29T01:02:03.000Z",
  ]) {
    const updated = validState({ updatedAt: value });
    assert.throws(() => assertValidContentOsState(updated), /UTC ISO timestamp/, value);

    const recorded = validState();
    recorded.results[0].recordedAt = value;
    assert.throws(() => assertValidContentOsState(recorded), /UTC ISO timestamp/, value);
  }

  for (const value of [
    "2024-02-29T01:02:03Z",
    "2024-02-29T01:02:03.000Z",
    "2024-02-29T01:02:03.123Z",
  ]) {
    assert.doesNotThrow(() => assertValidContentOsState(validState({ updatedAt: value })), value);
  }
});

test("planning state has a safe serialized size below the API envelope limit", () => {
  assert.equal(MAX_STATE_BYTES, 220 * 1024);
  const oversized = {
    ...defaultContentOsState(),
    book: Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      title: "Chapter note " + (index + 1),
      section: "Working section",
      stage: "Growing independence",
      family: "Make School & Learning Work",
      notes: "x".repeat(1200),
    })),
  };
  assert.throws(() => assertValidContentOsState(oversized), /UTF-8 bytes/);
});

test("backup metadata can count the full planning and analytics export", () => {
  assert.doesNotThrow(() => assertValidContentOsState(validState({ lastBackupResultCount: 11_000 })));
  assert.throws(
    () => assertValidContentOsState(validState({ lastBackupResultCount: 11_001 })),
    /lastBackupResultCount/,
  );
});

test("missing analytics remain null and require an explicit missing reason", () => {
  const state = validState();
  assert.equal(state.results[0].metrics.watchTimeSeconds, null);
  assert.equal(state.results[0].missingReasons.watchTimeSeconds, "not_collected");

  const missingReason = clone(state);
  missingReason.results[0].missingReasons.watchTimeSeconds = null;
  assert.throws(() => assertValidContentOsState(missingReason), /missingReasons\.watchTimeSeconds/);

  const falseMissingReason = clone(state);
  falseMissingReason.results[0].missingReasons.views = "not_collected";
  assert.throws(() => assertValidContentOsState(falseMissingReason), /must be null when the metric has a value/);
});

test("views and reach are distinct required fields", () => {
  const state = validState();
  assert.notEqual(state.results[0].metrics.views, state.results[0].metrics.reach);

  const withoutViews = clone(state);
  delete withoutViews.results[0].metrics.views;
  assert.throws(() => assertValidContentOsState(withoutViews), /metrics\.views/);

  const legacyCombinedField = clone(state);
  legacyCombinedField.results[0].metrics.reachOrViews = 1_000;
  assert.throws(() => assertValidContentOsState(legacyCombinedField), /reachOrViews/);
});

test("strict validation rejects unknown keys at every state layer", () => {
  const cases = [
    state => { state.privateMessages = []; },
    state => { state.calendar["2026-09-01"].label = "unexpected"; },
    state => { state.results[0].caption = "A full caption must not be stored"; },
    state => { state.results[0].metrics.commentText = "private message"; },
    state => { state.results[0].missingReasons.extra = "not_collected"; },
    state => { state.results[0].signals.username = "parent_handle"; },
    state => { state.book[0].clientName = "Private person"; },
    state => { state.products.unapproved = true; },
  ];

  for (const mutate of cases) {
    const state = clone(validState());
    mutate(state);
    assert.throws(() => assertValidContentOsState(state), /not part of this schema/);
  }
});

test("strict validation rejects prototype keys and non-plain objects", () => {
  const topLevel = validState();
  Object.defineProperty(topLevel, "__proto__", { value: { polluted: true }, enumerable: true });
  assert.throws(() => assertValidContentOsState(topLevel), /__proto__.*not allowed/);

  const nested = validState();
  Object.defineProperty(nested.results[0].metrics, "constructor", { value: {}, enumerable: true });
  assert.throws(() => assertValidContentOsState(nested), /constructor.*not allowed/);

  const inherited = validState();
  inherited.results[0].metrics = Object.create({ views: 999 });
  Object.assign(inherited.results[0].metrics, validResult().metrics);
  assert.throws(() => assertValidContentOsState(inherited), /must be a plain object/);
  assert.equal({}.polluted, undefined);
});

test("strict validation rejects unsafe values, duplicate IDs, and invalid links", () => {
  const cases = [
    [state => { state.results[0].metrics.views = -1; }, /non-negative/],
    [state => { state.results[0].metrics.views = Number.MAX_SAFE_INTEGER + 1; }, /safe integer/],
    [state => { state.results[0].postId = "javascript:alert(1)"; }, /http|https/],
    [state => { state.results[0].postId = "data:text/html,<script>alert(1)<\/script>"; }, /http|https/],
    [state => { state.results.push(clone(state.results[0])); }, /must be unique/],
    [state => { state.book.push(clone(state.book[0])); }, /must be unique/],
    [state => { state.results[0].patternSummary = "Contact parent@example.com"; }, /email|handles/],
    [state => { state.results[0].patternSummary = "Call +60 12 345 6789"; }, /phone/],
  ];

  for (const [mutate, message] of cases) {
    const state = clone(validState());
    mutate(state);
    assert.throws(() => assertValidContentOsState(state), message);
  }
});

test("every persisted planning text field rejects identifiers, links, and copied messages", () => {
  const textFields = [
    ["results[].topic", (state, value) => { state.results[0].topic = value; }],
    ["results[].area", (state, value) => { state.results[0].area = value; }],
    ["results[].family", (state, value) => { state.results[0].family = value; }],
    ["results[].length", (state, value) => { state.results[0].length = value; }],
    ["results[].version", (state, value) => { state.results[0].version = value; }],
    ["results[].cta", (state, value) => { state.results[0].cta = value; }],
    ["results[].patternSummary", (state, value) => { state.results[0].patternSummary = value; }],
    ["book[].title", (state, value) => { state.book[0].title = value; }],
    ["book[].section", (state, value) => { state.book[0].section = value; }],
    ["book[].stage", (state, value) => { state.book[0].stage = value; }],
    ["book[].family", (state, value) => { state.book[0].family = value; }],
    ["book[].notes", (state, value) => { state.book[0].notes = value; }],
  ];
  const leaks = [
    ["email", "Contact parent@example.com"],
    ["handle", "Follow up with @parent_handle"],
    ["phone", "Call +60 12 345 6789"],
    ["https URL", "See https://example.com/private-message"],
    ["bare URL", "Copied from example.com/private-message"],
    ["copied message", "Raw DM: My child needs help today"],
  ];

  for (const [field, setValue] of textFields) {
    for (const [kind, value] of leaks) {
      const state = clone(validState());
      setValue(state, value);
      assert.throws(
        () => assertValidContentOsState(state),
        undefined,
        `${field} accepted ${kind}`,
      );
    }
  }
});

test("planning text permits ordinary punctuation and ISO dates", () => {
  const state = validState();
  Object.assign(state.results[0], {
    topic: "Starting isn’t refusing: try one small step (then pause).",
    area: "Task-initiation / transitions",
    family: "School & learning",
    length: "42 sec. (A/B test)",
    version: "EP09-v1.2",
    cta: "Save/share if useful; no pressure.",
    patternSummary: "Reviewed 2026-09-02: parents recognised ‘start small’; 2/3 tried it.",
  });
  Object.assign(state.book[0], {
    title: "They know how. Why can’t they begin?",
    section: "School & learning",
    stage: "Growing independence (ages 12–18)",
    family: "Everyday life / transitions",
    notes: "Core lesson: pause, observe, then ask “What’s next?”",
  });
  assert.doesNotThrow(() => assertValidContentOsState(state));
});

test("postId permits only an HTTPS URL or a strict plain stable ID", () => {
  for (const postId of [
    "https://www.instagram.com/p/valid123/?igsh=safe-token",
    "https://www.tiktok.com/@apc/video/1234567890123456789",
    "legacy-post-id",
    "123456789012345678",
  ]) {
    const state = clone(validState());
    state.results[0].postId = postId;
    assert.doesNotThrow(() => assertValidContentOsState(state), postId);
  }

  for (const postId of [
    "http://example.com/post",
    "https://parent:secret@example.com/post",
    "javascript:alert(1)",
    "data:text/html,private",
    "www.example.com/post",
    "example.com/post",
    "parent@example.com",
    "@parent_handle",
    "+60 12 345 6789",
    "Copied message from a parent",
  ]) {
    const state = clone(validState());
    state.results[0].postId = postId;
    assert.throws(() => assertValidContentOsState(state), undefined, postId);
  }
});

test("calendar accepts arbitrary real dates and exact five-field entries", () => {
  const state = validState({
    calendar: {
      "2000-02-29": validCalendarEntry({ status: "idea", topic: "An older planning note" }),
      "2099-12-31": validCalendarEntry({ status: "ready", topic: "A future planning note" }),
    },
  });
  assert.doesNotThrow(() => assertValidContentOsState(state));

  for (const missingKey of ["status", "topic", "area", "family", "stage"]) {
    const entry = validCalendarEntry();
    delete entry[missingKey];
    const missing = validState({ calendar: { "2026-09-01": entry } });
    assert.throws(() => assertValidContentOsState(missing), new RegExp(missingKey));
  }

  const extra = validState();
  extra.calendar["2026-09-01"].notes = "Unexpected";
  assert.throws(() => assertValidContentOsState(extra), /notes.*not part of this schema/);

  const invalidStatus = validState();
  invalidStatus.calendar["2026-09-01"].status = "scheduled";
  assert.throws(() => assertValidContentOsState(invalidStatus), /status.*must be one of/);
});

test("calendar keys must be real YYYY-MM-DD dates and remain bounded", () => {
  for (const date of ["", "2026-02-31", "2026-2-03", "not-a-date"]) {
    const state = validState({ calendar: { [date]: validCalendarEntry() } });
    assert.throws(() => assertValidContentOsState(state), /calendar|date|YYYY-MM-DD|required/i, date);
  }

  const bounded = {};
  for (let index = 0; index < MAX_CALENDAR_ENTRIES; index += 1) {
    const date = new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
    bounded[date] = validCalendarEntry({ status: "idea", topic: `Topic ${index + 1}` });
  }
  assert.doesNotThrow(() => assertValidContentOsState(validState({ calendar: bounded })));

  const tooMany = clone(bounded);
  tooMany["2030-01-01"] = validCalendarEntry();
  assert.throws(
    () => assertValidContentOsState(validState({ calendar: tooMany })),
    /no more than 500 dates/,
  );
});

test("every calendar narrative field uses bounded deidentification", () => {
  const fields = [
    ["topic", 240],
    ["area", 160],
    ["family", 120],
    ["stage", 120],
  ];
  const leaks = [
    ["email", "Contact parent@example.com"],
    ["handle", "DM @parent_handle"],
    ["phone", "Call +60 12 345 6789"],
    ["URL", "See https://example.com/private-message"],
    ["copied message", "Raw DM: My child needs help today"],
  ];

  for (const [field, maximum] of fields) {
    for (const [kind, leak] of leaks) {
      const state = validState();
      state.calendar["2026-09-01"][field] = leak;
      assert.throws(
        () => assertValidContentOsState(state),
        undefined,
        `calendar ${field} accepted ${kind}`,
      );
    }

    const atLimit = validState();
    atLimit.calendar["2026-09-01"][field] = "x".repeat(maximum);
    assert.doesNotThrow(() => assertValidContentOsState(atLimit), field);

    const tooLong = validState();
    tooLong.calendar["2026-09-01"][field] = "x".repeat(maximum + 1);
    assert.throws(() => assertValidContentOsState(tooLong), /no longer than/);
  }

  const safe = validState();
  Object.assign(safe.calendar["2026-09-01"], {
    topic: "Starting isn’t refusing: try one step (then pause).",
    area: "Task-initiation / transitions",
    family: "School & learning",
    stage: "Growing independence (ages 12–18)",
  });
  assert.doesNotThrow(() => assertValidContentOsState(safe));
});

test("v2.1 and v2.2 calendars migrate status-only entries to the exact v2.3 shape", () => {
  for (const version of ["2.1", "2.2"]) {
    const legacy = validLegacyState(version);
    legacy.calendar = {
      "2000-02-29": { status: "posted" },
      "2099-12-31": { status: "ready" },
    };
    const before = clone(legacy);
    const migrated = migrateContentOsState(legacy);

    assert.deepEqual(legacy, before);
    assert.deepEqual(migrated.calendar, {
      "2000-02-29": { status: "posted", topic: "", area: "", family: "", stage: "" },
      "2099-12-31": { status: "ready", topic: "", area: "", family: "", stage: "" },
    });
    assertValidContentOsState(migrated);
  }

  const starterLegacy = validLegacyState("2.2");
  starterLegacy.calendar = {
    "2026-09-01": { status: "posted" },
    "2026-09-29": { status: "ready" },
    "2027-01-02": { status: "idea" },
  };
  const starterMigrated = migrateContentOsState(starterLegacy);
  assert.deepEqual(starterMigrated.calendar["2026-09-01"], {
    status: "posted",
    ...LEGACY_STARTER_CALENDAR["2026-09-01"],
  });
  assert.deepEqual(starterMigrated.calendar["2026-09-29"], {
    status: "ready",
    ...LEGACY_STARTER_CALENDAR["2026-09-29"],
  });
  assert.deepEqual(starterMigrated.calendar["2027-01-02"], {
    status: "idea",
    topic: "",
    area: "",
    family: "",
    stage: "",
  });

  const legacyWithNarrative = validLegacyState("2.2");
  legacyWithNarrative.calendar["2026-09-01"].topic = "Not part of the legacy schema";
  assert.throws(() => migrateContentOsState(legacyWithNarrative), /topic.*not part of this schema/);

  const malformedLegacyCalendars = [
    { "2026-02-31": { status: "posted" } },
    { "2026-09-01": {} },
    { "2026-09-01": { status: "scheduled" } },
  ];
  for (const calendar of malformedLegacyCalendars) {
    const legacy = validLegacyState("2.1");
    legacy.calendar = calendar;
    assert.throws(() => migrateContentOsState(legacy), /calendar|status|date|YYYY-MM-DD/i);
  }

  const invalidLegacyType = validLegacyState("2.1");
  invalidLegacyType.calendar = false;
  assert.throws(() => migrateContentOsState(invalidLegacyType), /plain object/);
});

test("legacy v2.1 migration is explicit, loss-aware, and does not mutate its input", () => {
  const legacy = {
    version: "2.1",
    calendar: { "2026-09-01": { status: "posted" } },
    results: [{
      id: 7,
      topic: "Legacy post",
      area: "Task initiation",
      family: "Make School & Learning Work",
      platform: "Instagram",
      date: "2026-09-01",
      snapshot: "72h",
      experiment: "Discovery post",
      postId: "legacy-post-id",
      format: "Reel",
      hookType: "Contradiction",
      length: "40 sec",
      version: "legacy-v1",
      reach: 900,
      saves: 18,
      shares: 9,
      comments: 4,
      dms: 2,
      requests: 1,
      interest: 0,
      paid: 0,
      cta: "Save",
      notes: "De-identified legacy theme",
    }],
    products: {},
    book: [],
    lastBackupAt: null,
    lastBackupResultCount: 1,
    updatedAt: "2026-09-02T01:02:03.000Z",
  };
  const before = clone(legacy);
  const migrated = migrateContentOsState(legacy);

  assert.deepEqual(legacy, before);
  assert.equal(migrated.version, "2.3");
  assert.equal(migrated.results[0].metrics.views, null);
  assert.equal(migrated.results[0].metrics.reach, 900);
  assert.equal(migrated.results[0].metrics.comments, null);
  assert.equal(migrated.results[0].signals.substantiveComments, 4);
  assert.equal(migrated.results[0].missingReasons.views, "legacy_not_collected");
  assert.equal(migrated.results[0].legacyMetricAmbiguity, true);
  assertValidContentOsState(migrated);
});

test("migration rejects future versions, unknown legacy fields, and private legacy text", () => {
  assert.throws(
    () => migrateContentOsState({ ...defaultContentOsState(), version: "99.0" }),
    /unsupported|future/,
  );

  const unknown = { ...defaultContentOsState(), version: "2.1", followerList: [] };
  assert.throws(() => migrateContentOsState(unknown), /followerList/);

  const privateLegacy = {
    ...defaultContentOsState(),
    version: "2.1",
    results: [{
      id: 1,
      topic: "Legacy post",
      area: "Task initiation",
      platform: "Instagram",
      notes: "Message parent@example.com for the full DM",
    }],
  };
  assert.throws(() => migrateContentOsState(privateLegacy), /email|handles/);
});

test("v2.1 and v2.2 migration reject privacy leaks in every mapped text field", () => {
  const legacyTextFields = [
    ["results[].topic", (state, value) => { state.results[0].topic = value; }],
    ["results[].area", (state, value) => { state.results[0].area = value; }],
    ["results[].family", (state, value) => { state.results[0].family = value; }],
    ["results[].postId", (state, value) => { state.results[0].postId = value; }],
    ["results[].length", (state, value) => { state.results[0].length = value; }],
    ["results[].version", (state, value) => { state.results[0].version = value; }],
    ["results[].cta", (state, value) => { state.results[0].cta = value; }],
    ["results[].notes", (state, value) => { state.results[0].notes = value; }],
    ["book[].title", (state, value) => { state.book[0].title = value; }],
    ["book[].section", (state, value) => { state.book[0].section = value; }],
    ["book[].stage", (state, value) => { state.book[0].stage = value; }],
    ["book[].family", (state, value) => { state.book[0].family = value; }],
    ["book[].notes", (state, value) => { state.book[0].notes = value; }],
  ];
  const leaks = [
    ["email", "Contact parent@example.com"],
    ["handle", "DM @parent_handle"],
    ["phone", "Call +60 12 345 6789"],
    ["URL", "See https://example.com/private-message"],
    ["copied message", "Verbatim message: My child needs help today"],
  ];

  for (const version of ["2.1", "2.2"]) {
    for (const [field, setValue] of legacyTextFields) {
      for (const [kind, value] of leaks) {
        if (field === "results[].postId" && kind === "URL") continue;
        const legacy = validLegacyState(version);
        setValue(legacy, value);
        assert.throws(
          () => migrateContentOsState(legacy),
          undefined,
          `${version} ${field} accepted ${kind}`,
        );
      }
    }
  }
});

test("legacy migration preserves safe punctuation and the intentional post URL", () => {
  const legacy = validLegacyState("2.2");
  legacy.results[0].topic = "Starting isn’t refusing: try one step (then pause).";
  legacy.results[0].area = "Task-initiation / transitions";
  legacy.results[0].version = "EP09-v1.2";
  legacy.results[0].postId = "https://www.instagram.com/p/valid123/?igsh=safe-token";
  legacy.results[0].notes = "Reviewed 2026-09-02: ‘start small’; 2/3 tried it.";
  legacy.book[0].notes = "Core lesson: pause, observe, then ask “What’s next?”";
  const before = clone(legacy);

  const migrated = migrateContentOsState(legacy);

  assert.deepEqual(legacy, before);
  assert.equal(migrated.results[0].topic, legacy.results[0].topic);
  assert.equal(migrated.results[0].postId, legacy.results[0].postId);
  assert.equal(migrated.results[0].patternSummary, legacy.results[0].notes);
  assert.equal(migrated.book[0].notes, legacy.book[0].notes);
});
