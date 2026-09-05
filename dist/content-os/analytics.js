export const ANALYTICS_SCHEMA_VERSION = "apc.analytics.v1";
export const ANALYTICS_PROTOCOL_VERSION = "APC-META-2026-09";
export const ANALYTICS_CHECKPOINTS = Object.freeze(["24h", "7d", "28d", "72h_legacy"]);
export const ANALYTICS_METRICS = Object.freeze([
  "views",
  "reach",
  "averageWatchTimeSeconds",
  "totalWatchTimeSeconds",
  "likes",
  "commentsCount",
  "saves",
  "shares",
]);
export const ANALYTICS_MISSING_REASONS = Object.freeze([
  "not_shown_in_source",
  "not_available_for_format",
  "not_collected",
  "not_yet_available",
  "permission_error",
  "legacy_ambiguous",
  "legacy_not_recorded",
]);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const PUBLICATION_KEYS = [
  "schemaVersion", "publicationId", "episodeId", "platform", "postRef", "publishedAt",
  "title", "topic", "problemArea", "productFamily", "format", "durationSeconds",
  "slideCount", "hookType", "creativeVersion", "ctaType", "experimentType",
];
const SNAPSHOT_KEYS = [
  "schemaVersion", "snapshotId", "publicationId", "checkpoint", "protocolVersion",
  "capturedAt", "metrics", "missingReasons", "signals", "deidentifiedThemeSummary",
  "collectionMethod", "sourceSystem", "sourceMetricVersion",
];

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

function object(value, path) {
  if (!isPlainObject(value)) fail(path, "must be a plain object");
  for (const key of Object.keys(value)) if (FORBIDDEN_KEYS.has(key)) fail(`${path}.${key}`, "is not allowed");
  return value;
}

function exactKeys(value, allowed, path) {
  object(value, path);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${path}.${key}`, "is not part of this schema");
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required");
}

function string(value, path, maximum, required = false) {
  if (typeof value !== "string") fail(path, "must be a string");
  if (required && !value) fail(path, "is required");
  if (value.length > maximum) fail(path, `must be no longer than ${maximum} characters`);
  if (/\p{Cc}/u.test(value)) fail(path, "must not contain control characters");
  return value;
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(", ")}`);
  return value;
}

function nullableCount(value, path) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) {
    fail(path, "must be a non-negative safe integer or null");
  }
  return value;
}

function nullableDuration(value, path) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    fail(path, "must be a non-negative finite number or null");
  }
  return value;
}

function nullableSmallCount(value, path) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    fail(path, "must be a non-negative safe integer or null");
  }
  return value;
}

export function isCanonicalUtcTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = millisecondText === undefined ? 0 : Number(millisecondText);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, second, millisecond);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === second &&
    parsed.getUTCMilliseconds() === millisecond;
}

function nullableIso(value, path) {
  if (value === null) return null;
  string(value, path, 40, true);
  if (!isCanonicalUtcTimestamp(value)) {
    fail(path, "must be a UTC ISO timestamp or null");
  }
  return value;
}

function stableId(value, path, prefix) {
  string(value, path, 100, true);
  if (!new RegExp(`^${prefix}_[a-zA-Z0-9-]{8,90}$`).test(value)) fail(path, `must start with ${prefix}_`);
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

function postReference(value, path) {
  string(value, path, 500, true);
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
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) fail(path, "must be an https URL or a plain stable ID");
  return value;
}

function deidentifiedText(value, path, maximum, required = false) {
  string(value, path, maximum, required);
  if (!value) return value;
  if (EMAIL_PATTERN.test(value)) fail(path, "must not contain email addresses");
  if (HANDLE_PATTERN.test(value)) fail(path, "must not contain social handles");
  if (containsUrl(value)) fail(path, "must not contain links or URLs");
  if (containsPhoneLikeIdentifier(value)) fail(path, "must not contain phone-like identifiers");
  if (COPIED_MESSAGE_PATTERN.test(value)) fail(path, "must contain a deidentified summary, not copied private messages");
  return value;
}

export function assertValidPublication(publication) {
  exactKeys(publication, PUBLICATION_KEYS, "publication");
  if (publication.schemaVersion !== ANALYTICS_SCHEMA_VERSION) fail("publication.schemaVersion", `must be ${ANALYTICS_SCHEMA_VERSION}`);
  stableId(publication.publicationId, "publication.publicationId", "pub");
  deidentifiedText(publication.episodeId, "publication.episodeId", 100);
  oneOf(publication.platform, ["Instagram", "TikTok", "Facebook", "YouTube"], "publication.platform");
  postReference(publication.postRef, "publication.postRef");
  nullableIso(publication.publishedAt, "publication.publishedAt");
  deidentifiedText(publication.title, "publication.title", 240);
  deidentifiedText(publication.topic, "publication.topic", 240, true);
  deidentifiedText(publication.problemArea, "publication.problemArea", 160, true);
  deidentifiedText(publication.productFamily, "publication.productFamily", 120);
  oneOf(publication.format, ["Carousel", "Photo Mode", "Reel", "Short", "Long-form", "Story"], "publication.format");
  nullableSmallCount(publication.durationSeconds, "publication.durationSeconds");
  nullableSmallCount(publication.slideCount, "publication.slideCount");
  oneOf(publication.hookType, ["Contradiction", "Frustration", "Uncomfortable recognition", "Wait, what?", "Taboo / rarely discussed", "Future fear", "Confusion", "Guilt / parent conflict", "Future worry", "Surprise", "Relief / reframe", "Other"], "publication.hookType");
  deidentifiedText(publication.creativeVersion, "publication.creativeVersion", 80);
  deidentifiedText(publication.ctaType, "publication.ctaType", 120);
  oneOf(publication.experimentType, ["Discovery post", "Replication post", "Waitlist / interest test", "Paid workshop"], "publication.experimentType");
  return publication;
}

export function assertValidAnalyticsSnapshot(snapshot) {
  exactKeys(snapshot, SNAPSHOT_KEYS, "snapshot");
  if (snapshot.schemaVersion !== ANALYTICS_SCHEMA_VERSION) fail("snapshot.schemaVersion", `must be ${ANALYTICS_SCHEMA_VERSION}`);
  stableId(snapshot.snapshotId, "snapshot.snapshotId", "snap");
  stableId(snapshot.publicationId, "snapshot.publicationId", "pub");
  oneOf(snapshot.checkpoint, ANALYTICS_CHECKPOINTS, "snapshot.checkpoint");
  deidentifiedText(snapshot.protocolVersion, "snapshot.protocolVersion", 80, true);
  nullableIso(snapshot.capturedAt, "snapshot.capturedAt");
  exactKeys(snapshot.metrics, ANALYTICS_METRICS, "snapshot.metrics");
  exactKeys(snapshot.missingReasons, ANALYTICS_METRICS, "snapshot.missingReasons");
  for (const key of ANALYTICS_METRICS) {
    const value = key === "averageWatchTimeSeconds"
      ? nullableDuration(snapshot.metrics[key], `snapshot.metrics.${key}`)
      : nullableCount(snapshot.metrics[key], `snapshot.metrics.${key}`);
    const reason = snapshot.missingReasons[key];
    if (value === null) oneOf(reason, ANALYTICS_MISSING_REASONS, `snapshot.missingReasons.${key}`);
    else if (reason !== null) fail(`snapshot.missingReasons.${key}`, "must be null when a metric is reported");
  }
  const signalKeys = ["substantiveCommentsCount", "dmProblemCount", "requestCount", "interestCount", "paidCount"];
  exactKeys(snapshot.signals, signalKeys, "snapshot.signals");
  for (const key of signalKeys) nullableSmallCount(snapshot.signals[key], `snapshot.signals.${key}`);
  deidentifiedText(snapshot.deidentifiedThemeSummary, "snapshot.deidentifiedThemeSummary", 400);
  oneOf(snapshot.collectionMethod, ["manual", "meta_connector", "tiktok_connector", "youtube_connector", "legacy_migration"], "snapshot.collectionMethod");
  oneOf(snapshot.sourceSystem, ["Meta Business Suite", "Instagram Insights", "TikTok Analytics", "YouTube Studio", "Legacy Content OS"], "snapshot.sourceSystem");
  deidentifiedText(snapshot.sourceMetricVersion, "snapshot.sourceMetricVersion", 80, true);
  return snapshot;
}

export function validateAnalyticsSubmission(value) {
  try {
    exactKeys(value, ["publication", "snapshot", "idempotencyKey"], "payload");
    assertValidPublication(value.publication);
    assertValidAnalyticsSnapshot(value.snapshot);
    if (value.publication.publicationId !== value.snapshot.publicationId) fail("payload", "publication and snapshot IDs do not match");
    string(value.idempotencyKey, "payload.idempotencyKey", 120, true);
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(value.idempotencyKey)) fail("payload.idempotencyKey", "has an invalid format");
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: String(error?.message || error) };
  }
}

export function safeRate(numerator, denominator, scale = 1000) {
  if (!Number.isFinite(numerator) || numerator < 0) return null;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator * scale;
}

export function median(values) {
  const finite = values.filter(value => Number.isFinite(value));
  if (!finite.length) return null;
  const sorted = [...finite].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function comparableSnapshots(records, target) {
  return records.filter(record =>
    record.snapshotId !== target.snapshotId &&
    record.platform === target.platform &&
    record.format === target.format &&
    record.checkpoint === target.checkpoint &&
    record.protocolVersion === target.protocolVersion
  );
}
