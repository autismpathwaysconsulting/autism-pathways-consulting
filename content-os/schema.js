export const STATE_SCHEMA_VERSION = "2.3";
export const MAX_STATE_BYTES = 220 * 1024;
export const MAX_CALENDAR_ENTRIES = 500;

export const CALENDAR_STATUSES = Object.freeze([
  "idea", "ready", "posted", "replicate", "validated", "stop",
]);

export const SNAPSHOTS = Object.freeze(["24h", "7d", "28d", "72h"]);

export const METRIC_KEYS = Object.freeze([
  "views",
  "reach",
  "watchTimeSeconds",
  "averageWatchTimeSeconds",
  "likes",
  "comments",
  "saves",
  "shares",
]);

export const MISSING_REASONS = Object.freeze([
  "not_collected",
  "not_shown_by_platform",
  "not_applicable",
  "legacy_not_collected",
]);

export const LEGACY_STARTER_CALENDAR = Object.freeze({
  "2026-09-01": Object.freeze({
    topic: "The homework takes 20 minutes. Starting it takes 90.",
    family: "Make School & Learning Work",
    stage: "Growing independence",
    area: "Task initiation / executive functioning",
  }),
  "2026-09-03": Object.freeze({
    topic: "They can tell me everything about Roblox. Then “How was school?” gets “I don’t know.”",
    family: "Make Communication Easier",
    stage: "Starting school",
    area: "Communication breakdowns",
  }),
  "2026-09-05": Object.freeze({
    topic: "I stayed calm. I warned them. I gave extra time. They STILL melted down.",
    family: "Understand the Behaviour",
    stage: "Starting school",
    area: "Behaviour, meltdowns & overwhelm",
  }),
  "2026-09-08": Object.freeze({
    topic: "I know they can dress themselves. But if I wait, we’ll be late. So I do it for them. Again.",
    family: "Build Independence",
    stage: "Starting school",
    area: "Independence / prompting",
  }),
  "2026-09-10": Object.freeze({
    topic: "Teacher: “They were fine today.” Me after the worst evening all week: “Fine?”",
    family: "Make School & Learning Work",
    stage: "Starting school",
    area: "School-home gap",
  }),
  "2026-09-12": Object.freeze({
    topic: "They eat chicken nuggets. Just not THAT chicken nugget.",
    family: "Everyday Life",
    stage: "Preschool",
    area: "Selective eating",
  }),
  "2026-09-15": Object.freeze({
    topic: "They blast YouTube. Then the hand dryer makes them cover their ears.",
    family: "Everyday Life",
    stage: "Starting school",
    area: "Sensory contradictions",
  }),
  "2026-09-17": Object.freeze({
    topic: "My child keeps touching themselves in the living room. Saying STOP isn’t enough.",
    family: "Growing Up Autistic",
    stage: "Puberty / early adolescence",
    area: "Puberty / privacy",
  }),
  "2026-09-19": Object.freeze({
    topic: "They’re exhausted all morning. Then 10pm comes and suddenly they’re wide awake.",
    family: "Everyday Life",
    stage: "Starting school",
    area: "Sleep",
  }),
  "2026-09-22": Object.freeze({
    topic: "“You already asked me that six times.” What if they aren’t actually asking for the answer?",
    family: "Make Communication Easier",
    stage: "Growing independence",
    area: "Repetitive questioning / uncertainty",
  }),
  "2026-09-24": Object.freeze({
    topic: "I corrected ONE small thing. Suddenly it’s: “I’m stupid. I can’t do anything.”",
    family: "Understand the Behaviour",
    stage: "Growing independence",
    area: "Emotional development",
  }),
  "2026-09-26": Object.freeze({
    topic: "At what age should I stop doing all of this for my child?",
    family: "Build Independence",
    stage: "Teen years",
    area: "Adolescent independence",
  }),
  "2026-09-29": Object.freeze({
    topic: "Winner follow-up based on September data",
    family: "Authority / Evidence",
    stage: "Teen years",
    area: "Winning problem validation",
  }),
});

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const STATE_KEYS = [
  "version", "calendar", "results", "products", "book",
  "lastBackupAt", "lastBackupResultCount", "updatedAt",
];
const CALENDAR_ENTRY_KEYS = ["status", "topic", "area", "family", "stage"];
const RESULT_KEYS = [
  "id", "topic", "area", "family", "platform", "date", "snapshot",
  "experiment", "postId", "format", "hookType", "length", "version",
  "metrics", "missingReasons", "signals", "metricSource", "recordedAt",
  "cta", "patternSummary", "legacyMetricAmbiguity",
];
const BOOK_KEYS = ["id", "title", "section", "stage", "family", "notes"];
const LEGACY_STATE_KEYS = [
  "version", "calendar", "results", "products", "book",
  "lastBackupAt", "lastBackupResultCount", "updatedAt",
];
const LEGACY_RESULT_KEYS = [
  "id", "topic", "area", "family", "platform", "date", "snapshot",
  "experiment", "postId", "format", "hookType", "length", "version",
  "reach", "saves", "shares", "comments", "dms", "requests", "interest",
  "paid", "cta", "notes",
];

const PLATFORM_VALUES = ["Instagram", "TikTok", "Facebook", "YouTube"];
const EXPERIMENT_VALUES = [
  "Discovery post", "Replication post", "Waitlist / interest test", "Paid workshop",
];
const FORMAT_VALUES = ["Carousel", "Photo Mode", "Reel", "Short", "Long-form", "Story"];
const HOOK_VALUES = [
  "Contradiction", "Frustration", "Uncomfortable recognition", "Wait, what?",
  "Taboo / rarely discussed", "Future fear", "Confusion", "Guilt / parent conflict",
  "Future worry", "Surprise", "Relief / reframe", "Other",
];
const METRIC_SOURCE_VALUES = ["manual_meta", "manual_other", "legacy"];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i;
const HANDLE_PATTERN = /@[a-z0-9_](?:[a-z0-9_.-]{0,29})/i;
const URL_SCHEME_PATTERN = /\b(?:https?|ftp|file|mailto|tel|data|javascript|vbscript|blob):/i;
const SCHEME_RELATIVE_URL_PATTERN = /(?:^|[^\p{L}\p{N}_])\/\/(?:[a-z0-9-]+\.)+[a-z]{2,63}\b/iu;
const WWW_URL_PATTERN = /(?:^|[^\p{L}\p{N}_])www\.(?:[a-z0-9-]+\.)*[a-z]{2,63}\b/iu;
const BARE_DOMAIN_PATTERN = /(?:^|[^\p{L}\p{N}_@])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?=$|[^\p{L}\p{N}_-])/iu;
const COPIED_MESSAGE_PATTERN = /\b(?:(?:raw|copied|verbatim)\s+(?:dm|direct message|message)|(?:dm|direct message|message)\s+from)\b/i;

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) fail(path, "must be a plain object");
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${path}.${key}`, "is not allowed");
  }
  return value;
}

function assertAllowedKeys(value, allowed, path) {
  assertPlainObject(value, path);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, "is not part of this schema");
  }
}

function assertArray(value, path, maximum) {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > maximum) fail(path, `must contain no more than ${maximum} items`);
  return value;
}

function assertString(value, path, { minimum = 0, maximum = 500, allowEmpty = true } = {}) {
  if (typeof value !== "string") fail(path, "must be a string");
  if ((!allowEmpty && value.length === 0) || value.length < minimum) fail(path, "is required");
  if (value.length > maximum) fail(path, `must be no longer than ${maximum} characters`);
  if (/\p{Cc}/u.test(value)) fail(path, "must not contain control characters");
  return value;
}

function containsPhoneLikeIdentifier(value) {
  const withoutIsoDates = value.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  return /(?:\+?\d[\s().-]?){8,}/.test(withoutIsoDates);
}

function containsUrl(value) {
  return URL_SCHEME_PATTERN.test(value) ||
    SCHEME_RELATIVE_URL_PATTERN.test(value) ||
    WWW_URL_PATTERN.test(value) ||
    BARE_DOMAIN_PATTERN.test(value);
}

function assertDeidentifiedText(value, path, options = {}) {
  assertString(value, path, options);
  if (!value) return value;
  if (EMAIL_PATTERN.test(value)) fail(path, "must not contain email addresses");
  if (HANDLE_PATTERN.test(value)) fail(path, "must not contain social handles");
  if (containsUrl(value)) fail(path, "must not contain links or URLs");
  if (containsPhoneLikeIdentifier(value)) fail(path, "must not contain phone-like identifiers");
  if (COPIED_MESSAGE_PATTERN.test(value)) fail(path, "must contain a deidentified summary, not copied private messages");
  return value;
}

function assertEnum(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(", ")}`);
  return value;
}

function assertSafeId(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(path, "must be a positive safe integer");
  return value;
}

function assertCount(value, path, { nullable = true } = {}) {
  if (value === null && nullable) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    fail(path, "must be a non-negative safe integer or null");
  }
  return value;
}

function assertNullableIso(value, path) {
  if (value === null) return null;
  assertString(value, path, { maximum: 40, allowEmpty: false });
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const parsed = new Date(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!pattern.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== canonical) {
    fail(path, "must be a UTC ISO timestamp or null");
  }
  return value;
}

function assertDate(value, path, { allowEmpty = true } = {}) {
  assertString(value, path, { maximum: 10, allowEmpty });
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(path, allowEmpty ? "must be YYYY-MM-DD or empty" : "must be YYYY-MM-DD");
  }
  if (value) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      fail(path, "must be a real calendar date");
    }
  }
  return value;
}

function assertPostId(value, path) {
  assertString(value, path, { maximum: 500 });
  if (!value) return value;
  if (/^https:\/\//i.test(value)) {
    let parsed;
    try { parsed = new URL(value); } catch { fail(path, "must be a valid URL"); }
    if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
      fail(path, "must be an https URL without embedded credentials");
    }
    return value;
  }
  if (containsUrl(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    fail(path, "may only use an https URL, or a plain stable ID");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    fail(path, "must be an https URL or a plain stable ID");
  }
  return value;
}

function validateCalendar(calendar, path = "state.calendar") {
  assertPlainObject(calendar, path);
  const entries = Object.entries(calendar);
  if (entries.length > MAX_CALENDAR_ENTRIES) {
    fail(path, `must contain no more than ${MAX_CALENDAR_ENTRIES} dates`);
  }
  for (const [date, entry] of entries) {
    assertDate(date, `${path} key`, { allowEmpty: false });
    assertAllowedKeys(entry, CALENDAR_ENTRY_KEYS, `${path}.${date}`);
    for (const key of CALENDAR_ENTRY_KEYS) {
      if (!Object.hasOwn(entry, key)) fail(`${path}.${date}.${key}`, "is required");
    }
    assertEnum(entry.status, CALENDAR_STATUSES, `${path}.${date}.status`);
    assertDeidentifiedText(entry.topic, `${path}.${date}.topic`, { maximum: 240 });
    assertDeidentifiedText(entry.area, `${path}.${date}.area`, { maximum: 160 });
    assertDeidentifiedText(entry.family, `${path}.${date}.family`, { maximum: 120 });
    assertDeidentifiedText(entry.stage, `${path}.${date}.stage`, { maximum: 120 });
  }
}

function validateMetrics(metrics, reasons, path) {
  assertAllowedKeys(metrics, METRIC_KEYS, `${path}.metrics`);
  assertAllowedKeys(reasons, METRIC_KEYS, `${path}.missingReasons`);
  for (const key of METRIC_KEYS) {
    if (!Object.hasOwn(metrics, key)) fail(`${path}.metrics.${key}`, "is required");
    if (!Object.hasOwn(reasons, key)) fail(`${path}.missingReasons.${key}`, "is required");
    const value = assertCount(metrics[key], `${path}.metrics.${key}`);
    const reason = reasons[key];
    if (value === null) assertEnum(reason, MISSING_REASONS, `${path}.missingReasons.${key}`);
    else if (reason !== null) fail(`${path}.missingReasons.${key}`, "must be null when the metric has a value");
  }
}

function validateSignals(signals, path) {
  const keys = ["substantiveComments", "dms", "requests", "interest", "paid"];
  assertAllowedKeys(signals, keys, `${path}.signals`);
  for (const key of keys) {
    if (!Object.hasOwn(signals, key)) fail(`${path}.signals.${key}`, "is required");
    assertCount(signals[key], `${path}.signals.${key}`);
  }
}

function validateResult(result, index) {
  const path = `state.results[${index}]`;
  assertAllowedKeys(result, RESULT_KEYS, path);
  for (const key of RESULT_KEYS) if (!Object.hasOwn(result, key)) fail(`${path}.${key}`, "is required");
  assertSafeId(result.id, `${path}.id`);
  assertDeidentifiedText(result.topic, `${path}.topic`, { maximum: 240, allowEmpty: false });
  assertDeidentifiedText(result.area, `${path}.area`, { maximum: 160, allowEmpty: false });
  assertDeidentifiedText(result.family, `${path}.family`, { maximum: 120 });
  assertEnum(result.platform, PLATFORM_VALUES, `${path}.platform`);
  assertDate(result.date, `${path}.date`);
  assertEnum(result.snapshot, SNAPSHOTS, `${path}.snapshot`);
  assertEnum(result.experiment, EXPERIMENT_VALUES, `${path}.experiment`);
  assertPostId(result.postId, `${path}.postId`);
  assertEnum(result.format, FORMAT_VALUES, `${path}.format`);
  assertEnum(result.hookType, HOOK_VALUES, `${path}.hookType`);
  assertDeidentifiedText(result.length, `${path}.length`, { maximum: 80 });
  assertDeidentifiedText(result.version, `${path}.version`, { maximum: 80 });
  validateMetrics(result.metrics, result.missingReasons, path);
  validateSignals(result.signals, path);
  assertEnum(result.metricSource, METRIC_SOURCE_VALUES, `${path}.metricSource`);
  assertNullableIso(result.recordedAt, `${path}.recordedAt`);
  assertDeidentifiedText(result.cta, `${path}.cta`, { maximum: 240 });
  assertDeidentifiedText(result.patternSummary, `${path}.patternSummary`, { maximum: 400 });
  if (typeof result.legacyMetricAmbiguity !== "boolean") fail(`${path}.legacyMetricAmbiguity`, "must be boolean");
}

function validateBookItem(item, index) {
  const path = `state.book[${index}]`;
  assertAllowedKeys(item, BOOK_KEYS, path);
  for (const key of BOOK_KEYS) if (!Object.hasOwn(item, key)) fail(`${path}.${key}`, "is required");
  assertSafeId(item.id, `${path}.id`);
  assertDeidentifiedText(item.title, `${path}.title`, { maximum: 240, allowEmpty: false });
  assertDeidentifiedText(item.section, `${path}.section`, { maximum: 160 });
  assertDeidentifiedText(item.stage, `${path}.stage`, { maximum: 120 });
  assertDeidentifiedText(item.family, `${path}.family`, { maximum: 120 });
  assertDeidentifiedText(item.notes, `${path}.notes`, { maximum: 1200 });
}

export function defaultContentOsState() {
  return {
    version: STATE_SCHEMA_VERSION,
    calendar: {},
    results: [],
    products: {},
    book: [],
    lastBackupAt: null,
    lastBackupResultCount: 0,
    updatedAt: null,
  };
}

export function assertValidContentOsState(state) {
  assertAllowedKeys(state, STATE_KEYS, "state");
  for (const key of STATE_KEYS) if (!Object.hasOwn(state, key)) fail(`state.${key}`, "is required");
  if (state.version !== STATE_SCHEMA_VERSION) fail("state.version", `must be ${STATE_SCHEMA_VERSION}`);
  validateCalendar(state.calendar);
  const results = assertArray(state.results, "state.results", 1000);
  const resultIds = new Set();
  results.forEach((result, index) => {
    validateResult(result, index);
    if (resultIds.has(result.id)) fail(`state.results[${index}].id`, "must be unique");
    resultIds.add(result.id);
  });
  assertAllowedKeys(state.products, [], "state.products");
  const book = assertArray(state.book, "state.book", 500);
  const bookIds = new Set();
  book.forEach((item, index) => {
    validateBookItem(item, index);
    if (bookIds.has(item.id)) fail(`state.book[${index}].id`, "must be unique");
    bookIds.add(item.id);
  });
  assertNullableIso(state.lastBackupAt, "state.lastBackupAt");
  if (!Number.isSafeInteger(state.lastBackupResultCount) || state.lastBackupResultCount < 0 || state.lastBackupResultCount > 11000) {
    fail("state.lastBackupResultCount", "must be a non-negative safe integer");
  }
  assertNullableIso(state.updatedAt, "state.updatedAt");
  const encodedBytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
  if (encodedBytes > MAX_STATE_BYTES) {
    fail("state", `must be no larger than ${MAX_STATE_BYTES} UTF-8 bytes`);
  }
  return state;
}

export function validateContentOsState(state) {
  try {
    assertValidContentOsState(state);
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: String(error?.message || error) };
  }
}

function legacyMetric(value, path) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number") fail(path, "must be a number in a legacy backup");
  return assertCount(value, path);
}

function legacyString(value, path, fallback = "", maximum = 500) {
  if (value === undefined || value === null) return fallback;
  return assertString(value, path, { maximum });
}

function missingReasonsFor(metrics) {
  return Object.fromEntries(METRIC_KEYS.map(key => [key, metrics[key] === null ? "legacy_not_collected" : null]));
}

function migrateLegacyResult(result, index, stateUpdatedAt) {
  const path = `state.results[${index}]`;
  assertAllowedKeys(result, LEGACY_RESULT_KEYS, path);
  const reach = legacyMetric(result.reach, `${path}.reach`);
  const metrics = {
    views: null,
    reach,
    watchTimeSeconds: null,
    averageWatchTimeSeconds: null,
    likes: null,
    comments: null,
    saves: legacyMetric(result.saves, `${path}.saves`),
    shares: legacyMetric(result.shares, `${path}.shares`),
  };
  const migrated = {
    id: assertSafeId(result.id, `${path}.id`),
    topic: legacyString(result.topic, `${path}.topic`, "", 240),
    area: legacyString(result.area, `${path}.area`, legacyString(result.topic, `${path}.topic`, "Unclassified problem", 240), 160),
    family: legacyString(result.family, `${path}.family`, "", 120),
    platform: result.platform || "Instagram",
    date: legacyString(result.date, `${path}.date`, "", 10),
    snapshot: result.snapshot || "72h",
    experiment: result.experiment || "Discovery post",
    postId: legacyString(result.postId, `${path}.postId`, "", 500),
    format: result.format || (result.platform === "TikTok" ? "Photo Mode" : "Carousel"),
    hookType: result.hookType || "Other",
    length: legacyString(result.length, `${path}.length`, "", 80),
    version: legacyString(result.version, `${path}.version`, "legacy", 80),
    metrics,
    missingReasons: missingReasonsFor(metrics),
    signals: {
      substantiveComments: legacyMetric(result.comments, `${path}.comments`),
      dms: legacyMetric(result.dms, `${path}.dms`),
      requests: legacyMetric(result.requests, `${path}.requests`),
      interest: legacyMetric(result.interest, `${path}.interest`),
      paid: legacyMetric(result.paid, `${path}.paid`),
    },
    metricSource: "legacy",
    recordedAt: stateUpdatedAt,
    cta: legacyString(result.cta, `${path}.cta`, "", 240),
    patternSummary: legacyString(result.notes, `${path}.notes`, "", 400),
    legacyMetricAmbiguity: true,
  };
  assertValidContentOsState({ ...defaultContentOsState(), results: [migrated] });
  return migrated;
}

function migrateLegacyBookItem(item, index) {
  const path = `state.book[${index}]`;
  assertAllowedKeys(item, BOOK_KEYS, path);
  const migrated = {
    id: assertSafeId(item.id, `${path}.id`),
    title: legacyString(item.title, `${path}.title`, "", 240),
    section: legacyString(item.section, `${path}.section`, "", 160),
    stage: legacyString(item.stage, `${path}.stage`, "", 120),
    family: legacyString(item.family, `${path}.family`, "", 120),
    notes: legacyString(item.notes, `${path}.notes`, "", 1200),
  };
  validateBookItem(migrated, index);
  return migrated;
}

function migrateLegacyCalendar(calendar) {
  const path = "state.calendar";
  assertPlainObject(calendar, path);
  const entries = Object.entries(calendar);
  if (entries.length > MAX_CALENDAR_ENTRIES) {
    fail(path, `must contain no more than ${MAX_CALENDAR_ENTRIES} dates`);
  }
  return Object.fromEntries(entries.map(([date, entry]) => {
    assertDate(date, `${path} key`, { allowEmpty: false });
    assertAllowedKeys(entry, ["status"], `${path}.${date}`);
    if (!Object.hasOwn(entry, "status")) fail(`${path}.${date}.status`, "is required");
    assertEnum(entry.status, CALENDAR_STATUSES, `${path}.${date}.status`);
    const starter = LEGACY_STARTER_CALENDAR[date] || {
      topic: "",
      area: "",
      family: "",
      stage: "",
    };
    return [date, {
      status: entry.status,
      topic: starter.topic,
      area: starter.area,
      family: starter.family,
      stage: starter.stage,
    }];
  }));
}

function migrateLegacyState(raw) {
  assertAllowedKeys(raw, LEGACY_STATE_KEYS, "state");
  assertAllowedKeys(raw.products || {}, [], "state.products");
  const updatedAt = raw.updatedAt === undefined || raw.updatedAt === null ? null : assertNullableIso(raw.updatedAt, "state.updatedAt");
  const legacyCalendar = raw.calendar === undefined || raw.calendar === null ? {} : raw.calendar;
  const migrated = {
    version: STATE_SCHEMA_VERSION,
    calendar: migrateLegacyCalendar(legacyCalendar),
    results: assertArray(raw.results || [], "state.results", 1000).map((item, index) => migrateLegacyResult(item, index, updatedAt)),
    products: {},
    book: assertArray(raw.book || [], "state.book", 500).map(migrateLegacyBookItem),
    lastBackupAt: raw.lastBackupAt === undefined || raw.lastBackupAt === null ? null : assertNullableIso(raw.lastBackupAt, "state.lastBackupAt"),
    lastBackupResultCount: raw.lastBackupResultCount === undefined ? 0 : raw.lastBackupResultCount,
    updatedAt,
  };
  assertValidContentOsState(migrated);
  return migrated;
}

export function migrateContentOsState(raw) {
  if (raw === null || raw === undefined) return defaultContentOsState();
  assertPlainObject(raw, "state");
  if (raw.version === STATE_SCHEMA_VERSION) {
    assertValidContentOsState(raw);
    return structuredClone(raw);
  }
  if (raw.version === "2.1" || raw.version === "2.2") return migrateLegacyState(raw);
  fail("state.version", "is unsupported or from a future schema");
}
