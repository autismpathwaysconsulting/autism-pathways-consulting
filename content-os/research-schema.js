export const RESEARCH_BUNDLE_SCHEMA = "apc.research_bundle.v1";
const APC_TIME_ZONE = "Asia/Kuala_Lumpur";
const ANALYTICS_FRESHNESS_MS = 14 * 24 * 60 * 60 * 1000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
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

export function canonicalResearchJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalResearchJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalResearchJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, keys, path) {
  if (!isPlainObject(value)) fail(path, "must be a plain object");
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${path}.${key}`, "is not allowed");
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not part of this schema");
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required");
}

function text(value, path, maximum, required = true) {
  if (typeof value !== "string") fail(path, "must be a string");
  if (required && !value) fail(path, "is required");
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

function deidentifiedText(value, path, maximum, required = true) {
  text(value, path, maximum, required);
  if (!value) return value;
  if (EMAIL_PATTERN.test(value)) fail(path, "must not contain email addresses");
  if (HANDLE_PATTERN.test(value)) fail(path, "must not contain social handles");
  if (containsUrl(value)) fail(path, "must not contain links or URLs");
  if (containsPhoneLikeIdentifier(value)) fail(path, "must not contain phone-like identifiers");
  if (COPIED_MESSAGE_PATTERN.test(value)) fail(path, "must contain a deidentified summary, not copied private messages");
  return value;
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(", ")}`);
  return value;
}

function iso(value, path, nullable = false) {
  if (nullable && value === null) return null;
  text(value, path, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    fail(path, "must be a UTC ISO timestamp");
  }
  const timestamp = Date.parse(value);
  const expectedCanonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString() !== expectedCanonical) {
    fail(path, "must be a real UTC ISO timestamp");
  }
  return timestamp;
}

function apcIsoWeek(timestamp) {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  localDate.setUTCDate(localDate.getUTCDate() + 4 - (localDate.getUTCDay() || 7));
  const weekYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((localDate - yearStart) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function httpsUrl(value, path) {
  text(value, path, 600);
  let parsed;
  try { parsed = new URL(value); } catch { fail(path, "must be a valid URL"); }
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail(path, "must be an https URL without embedded credentials");
  }
  return value;
}

function id(value, path, prefix) {
  text(value, path, 120);
  if (!new RegExp(`^${prefix}:[a-zA-Z0-9._-]{4,100}$`).test(value)) fail(path, `must start with ${prefix}:`);
  return value;
}

function validateAnalyticsContext(context, bundleGeneratedAt) {
  const path = "bundle.analytics_context";
  exactKeys(context, ["status", "summary_run_id", "generated_at"], path);
  oneOf(context.status, ["available", "stale", "unavailable"], `${path}.status`);
  if (context.summary_run_id !== null) id(context.summary_run_id, `${path}.summary_run_id`, "analytics");
  const summaryGeneratedAt = iso(context.generated_at, `${path}.generated_at`, true);

  if (context.status === "unavailable") {
    if (context.summary_run_id !== null || context.generated_at !== null) {
      fail(path, "unavailable analytics must have null summary_run_id and generated_at");
    }
    return;
  }

  if (context.summary_run_id === null || context.generated_at === null) {
    fail(path, `${context.status} analytics must have a summary_run_id and generated_at`);
  }

  const age = bundleGeneratedAt - summaryGeneratedAt;
  if (age < 0) fail(`${path}.generated_at`, "must not be in the future relative to bundle.generated_at");
  if (context.status === "available" && age > ANALYTICS_FRESHNESS_MS) {
    fail(`${path}.generated_at`, "available analytics must be no more than 14 days old");
  }
  if (context.status === "stale" && age <= ANALYTICS_FRESHNESS_MS) {
    fail(`${path}.generated_at`, "stale analytics must be more than 14 days old");
  }
}

function array(value, path, maximum) {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > maximum) fail(path, `must contain no more than ${maximum} items`);
  return value;
}

function validateSource(source, index) {
  const path = `bundle.sources[${index}]`;
  exactKeys(source, ["id", "name", "url", "published_at", "accessed_at", "type"], path);
  id(source.id, `${path}.id`, "source");
  deidentifiedText(source.name, `${path}.name`, 160);
  httpsUrl(source.url, `${path}.url`);
  iso(source.published_at, `${path}.published_at`, true);
  iso(source.accessed_at, `${path}.accessed_at`);
  oneOf(source.type, ["official_platform", "research_paper", "official_guidance", "public_creator_education"], `${path}.type`);
}

function validateFinding(finding, index, sourceIds) {
  const path = `bundle.findings[${index}]`;
  exactKeys(finding, ["id", "title", "summary", "evidence_status", "source_ids", "limitations"], path);
  id(finding.id, `${path}.id`, "finding");
  deidentifiedText(finding.title, `${path}.title`, 180);
  deidentifiedText(finding.summary, `${path}.summary`, 600);
  oneOf(finding.evidence_status, ["observation", "candidate_hypothesis"], `${path}.evidence_status`);
  const ids = array(finding.source_ids, `${path}.source_ids`, 8);
  if (!ids.length) fail(`${path}.source_ids`, "must reference at least one source");
  for (const sourceId of ids) {
    text(sourceId, `${path}.source_ids[]`, 120);
    if (!sourceIds.has(sourceId)) fail(`${path}.source_ids`, `references unknown source ${sourceId}`);
  }
  deidentifiedText(finding.limitations, `${path}.limitations`, 400, false);
}

function validateTopic(topic, index, findingIds) {
  const path = `bundle.topic_candidates[${index}]`;
  exactKeys(topic, [
    "id", "parent_problem", "hook", "possible_mechanism", "practical_action", "ending",
    "series", "category", "format", "finding_ids", "confidence", "limitations", "prompt_seed",
  ], path);
  id(topic.id, `${path}.id`, "topic");
  deidentifiedText(topic.parent_problem, `${path}.parent_problem`, 240);
  deidentifiedText(topic.hook, `${path}.hook`, 240);
  deidentifiedText(topic.possible_mechanism, `${path}.possible_mechanism`, 400);
  deidentifiedText(topic.practical_action, `${path}.practical_action`, 400);
  oneOf(topic.ending, ["none", "save", "share", "comment_question", "story_question", "waitlist"], `${path}.ending`);
  deidentifiedText(topic.series, `${path}.series`, 120);
  deidentifiedText(topic.category, `${path}.category`, 160);
  oneOf(topic.format, ["Reel", "Carousel", "Story", "YouTube", "Any"], `${path}.format`);
  const ids = array(topic.finding_ids, `${path}.finding_ids`, 5);
  if (!ids.length) fail(`${path}.finding_ids`, "must reference at least one finding");
  for (const findingId of ids) {
    text(findingId, `${path}.finding_ids[]`, 120);
    if (!findingIds.has(findingId)) fail(`${path}.finding_ids`, `references unknown finding ${findingId}`);
  }
  oneOf(topic.confidence, ["low", "medium", "high"], `${path}.confidence`);
  deidentifiedText(topic.limitations, `${path}.limitations`, 400, false);
  deidentifiedText(topic.prompt_seed, `${path}.prompt_seed`, 1000);
}

export function assertValidResearchBundle(bundle) {
  exactKeys(bundle, [
    "schema_version", "run_id", "task_id", "generated_at", "status",
    "analytics_context", "sources", "findings", "topic_candidates",
  ], "bundle");
  if (bundle.schema_version !== RESEARCH_BUNDLE_SCHEMA) fail("bundle.schema_version", `must be ${RESEARCH_BUNDLE_SCHEMA}`);
  text(bundle.run_id, "bundle.run_id", 120);
  if (!/^apc-weekly-topic-review:\d{4}-W\d{2}$/.test(bundle.run_id)) fail("bundle.run_id", "must use the weekly task ID and ISO week");
  if (bundle.task_id !== "apc-weekly-topic-review") fail("bundle.task_id", "is not an approved producer");
  const bundleGeneratedAt = iso(bundle.generated_at, "bundle.generated_at");
  if (bundle.run_id !== `apc-weekly-topic-review:${apcIsoWeek(bundle.generated_at)}`) {
    fail("bundle.run_id", `must match the generated_at ISO week in ${APC_TIME_ZONE}`);
  }
  oneOf(bundle.status, ["complete", "no_change"], "bundle.status");

  validateAnalyticsContext(bundle.analytics_context, bundleGeneratedAt);

  const sources = array(bundle.sources, "bundle.sources", 8);
  sources.forEach(validateSource);
  const sourceIds = new Set(sources.map(source => source.id));
  if (sourceIds.size !== sources.length) fail("bundle.sources", "source IDs must be unique");

  const findings = array(bundle.findings, "bundle.findings", 5);
  findings.forEach((finding, index) => validateFinding(finding, index, sourceIds));
  const findingIds = new Set(findings.map(finding => finding.id));
  if (findingIds.size !== findings.length) fail("bundle.findings", "finding IDs must be unique");

  const topics = array(bundle.topic_candidates, "bundle.topic_candidates", 3);
  topics.forEach((topic, index) => validateTopic(topic, index, findingIds));
  const topicIds = new Set(topics.map(topic => topic.id));
  if (topicIds.size !== topics.length) fail("bundle.topic_candidates", "topic IDs must be unique");

  if (bundle.status === "no_change" && (sources.length || findings.length || topics.length)) {
    fail("bundle", "a no_change bundle must not contain records");
  }
  if (bundle.status === "complete" && (!sources.length || !findings.length || !topics.length)) {
    fail("bundle", "a complete bundle requires sources, findings, and topics");
  }
  return bundle;
}

export function validateResearchBundle(bundle) {
  try {
    assertValidResearchBundle(bundle);
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: String(error?.message || error) };
  }
}
