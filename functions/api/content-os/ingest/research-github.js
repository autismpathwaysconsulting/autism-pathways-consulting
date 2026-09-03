import {
  assertValidResearchBundle,
  canonicalResearchJson,
} from "../../../../content-os/research-schema.js";

export const MAX_RESEARCH_WEBHOOK_BYTES = 64 * 1024;

const EXPECTED_EVENT = "issues";
const EXPECTED_ACTION = "opened";
const EXPECTED_REPOSITORY_ID = 1327407191;
const EXPECTED_REPOSITORY = "autismpathwaysconsulting/APC-AI-OS";
const EXPECTED_SENDER = "autismpathwaysconsulting";
const EXPECTED_LABEL = "apc-dashboard-feed";
const TITLE_PREFIX = "APC Research Bundle: ";
const MAX_BUNDLE_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();

class ResearchWebhookError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function header(request, name) {
  return (request.headers.get(name) || "").trim();
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function bytesFromHex(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(actual, expected) {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (actual[index] ?? 0) ^ expected[index];
  }
  return difference === 0;
}

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyGithubSignature(secret, rawBody, suppliedSignature) {
  if (typeof secret !== "string" || !secret) return false;
  const supplied = suppliedSignature.startsWith("sha256=")
    ? bytesFromHex(suppliedSignature.slice("sha256=".length))
    : null;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  return constantTimeEqual(supplied || new Uint8Array(0), expected);
}

function declaredBodyLength(request, maximumBytes) {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new ResearchWebhookError(400, "invalid_content_length", "Content-Length must be a non-negative decimal integer.");
  }
  let declared;
  try {
    declared = BigInt(value);
  } catch {
    throw new ResearchWebhookError(400, "invalid_content_length", "Content-Length is invalid.");
  }
  if (declared > BigInt(maximumBytes)) {
    throw new ResearchWebhookError(413, "body_too_large", "Request body is too large.");
  }
  return Number(declared);
}

function isExactJsonContentType(value) {
  const parts = value.split(";");
  if (parts.shift()?.trim().toLowerCase() !== "application/json") return false;
  if (parts.length === 0) return true;
  if (parts.length !== 1) return false;
  return /^\s*charset\s*=\s*(?:utf-8|"utf-8")\s*$/i.test(parts[0]);
}

async function readBoundedBody(request, maximumBytes) {
  const declared = declaredBodyLength(request, maximumBytes);
  if (!request.body) {
    if (declared !== null && declared !== 0) {
      throw new ResearchWebhookError(400, "content_length_mismatch", "Content-Length does not match the request body.");
    }
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("body too large");
      throw new ResearchWebhookError(413, "body_too_large", "Request body is too large.");
    }
    chunks.push(value);
  }

  if (declared !== null && declared !== total) {
    throw new ResearchWebhookError(400, "content_length_mismatch", "Content-Length does not match the request body.");
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function requireSafeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ResearchWebhookError(400, "invalid_webhook", `${path} must be a positive integer.`);
  }
}

function requireLogin(value, path) {
  if (!isPlainObject(value) || value.login !== EXPECTED_SENDER) {
    throw new ResearchWebhookError(403, "unapproved_sender", `${path} is not approved.`);
  }
}

export function parseResearchWebhook(payload, now = new Date()) {
  if (!isPlainObject(payload)) {
    throw new ResearchWebhookError(400, "invalid_webhook", "Webhook payload must be an object.");
  }
  if (payload.action !== EXPECTED_ACTION) {
    throw new ResearchWebhookError(403, "unapproved_action", "Only newly opened research-bundle issues are accepted.");
  }
  if (!isPlainObject(payload.repository) ||
      payload.repository.id !== EXPECTED_REPOSITORY_ID ||
      payload.repository.full_name !== EXPECTED_REPOSITORY ||
      payload.repository.private !== true) {
    throw new ResearchWebhookError(403, "unapproved_repository", "Webhook repository is not approved.");
  }
  requireLogin(payload.sender, "sender");
  if (!isPlainObject(payload.issue) || payload.issue.pull_request) {
    throw new ResearchWebhookError(400, "invalid_issue", "Webhook must contain a GitHub issue.");
  }
  requireSafeInteger(payload.issue.id, "issue.id");
  requireSafeInteger(payload.issue.number, "issue.number");
  requireLogin(payload.issue.user, "issue.user");
  if (!Array.isArray(payload.issue.labels) ||
      !payload.issue.labels.some(label => isPlainObject(label) && label.name === EXPECTED_LABEL)) {
    throw new ResearchWebhookError(403, "missing_label", "Research bundle label is missing.");
  }
  if (typeof payload.issue.body !== "string" || !payload.issue.body || payload.issue.body.length > MAX_RESEARCH_WEBHOOK_BYTES) {
    throw new ResearchWebhookError(400, "invalid_issue_body", "Issue body must contain one bounded JSON bundle.");
  }

  let bundle;
  try {
    bundle = JSON.parse(payload.issue.body);
  } catch {
    throw new ResearchWebhookError(400, "invalid_bundle_json", "Issue body is not valid JSON.");
  }
  try {
    assertValidResearchBundle(bundle);
  } catch (error) {
    throw new ResearchWebhookError(422, "invalid_bundle", String(error?.message || error));
  }

  if (payload.issue.title !== `${TITLE_PREFIX}${bundle.run_id}`) {
    throw new ResearchWebhookError(403, "invalid_issue_title", "Issue title does not match the bundle run ID.");
  }
  const generatedAt = Date.parse(bundle.generated_at);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs) || generatedAt < nowMs - MAX_BUNDLE_AGE_MS || generatedAt > nowMs + MAX_FUTURE_SKEW_MS) {
    throw new ResearchWebhookError(422, "stale_bundle", "Research bundle timestamp is outside the accepted window.");
  }
  return bundle;
}

function storageItemId(runId, sourceItemId) {
  return `${runId}|${sourceItemId}`;
}

async function existingClassification(database, deliveryId, runId, payloadHash) {
  const delivery = await database.prepare(
    "SELECT delivery_id, run_id, payload_hash, status FROM automation_deliveries WHERE delivery_id = ?",
  ).bind(deliveryId).first();
  if (delivery) {
    return delivery.run_id === runId && delivery.payload_hash === payloadHash && delivery.status === "accepted"
      ? "duplicate"
      : "conflict";
  }
  const run = await database.prepare(
    "SELECT run_id, payload_hash FROM research_runs WHERE run_id = ?",
  ).bind(runId).first();
  if (!run) return "new";
  return run.payload_hash === payloadHash ? "duplicate" : "conflict";
}

async function recordConflict(database, deliveryId, runId, receivedAt, payloadHash) {
  try {
    await database.prepare(`INSERT INTO automation_deliveries
      (delivery_id, run_id, received_at, payload_hash, status, error_code)
      VALUES (?, ?, ?, ?, 'conflict', 'run_id_payload_conflict')`)
      .bind(deliveryId, runId, receivedAt, payloadHash)
      .run();
  } catch {
    // A replayed conflict may already be recorded. Never mutate the audit row.
  }
}

function acceptedStatements(database, deliveryId, bundle, receivedAt, payloadHash) {
  const statements = [
    database.prepare(`INSERT INTO automation_deliveries
      (delivery_id, run_id, received_at, payload_hash, status, error_code)
      VALUES (?, ?, ?, ?, 'accepted', NULL)`)
      .bind(deliveryId, bundle.run_id, receivedAt, payloadHash),
    database.prepare(`INSERT INTO research_runs
      (run_id, generated_at, received_at, status, analytics_status, payload_hash, bundle_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        bundle.run_id,
        bundle.generated_at,
        receivedAt,
        bundle.status,
        bundle.analytics_context.status,
        payloadHash,
        JSON.stringify(bundle),
      ),
  ];

  for (const finding of bundle.findings) {
    statements.push(database.prepare(`INSERT INTO research_items
      (item_id, run_id, item_type, title, created_at, item_json)
      VALUES (?, ?, 'finding', ?, ?, ?)`)
      .bind(
        storageItemId(bundle.run_id, finding.id),
        bundle.run_id,
        finding.title,
        receivedAt,
        JSON.stringify(finding),
      ));
  }
  for (const topic of bundle.topic_candidates) {
    statements.push(database.prepare(`INSERT INTO research_items
      (item_id, run_id, item_type, title, created_at, item_json)
      VALUES (?, ?, 'topic', ?, ?, ?)`)
      .bind(
        storageItemId(bundle.run_id, topic.id),
        bundle.run_id,
        topic.hook,
        receivedAt,
        JSON.stringify(topic),
      ));
  }
  return statements;
}

export async function onRequestPost({ request, env }) {
  if (env.APC_CONTENT_OS_AUTOMATION_ENABLED !== "true" || !env.APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET) {
    return json({ error: "Research ingestion is not configured." }, 503);
  }
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  if (header(request, "X-GitHub-Event") !== EXPECTED_EVENT) {
    return json({ error: "Unsupported webhook event." }, 403);
  }
  const deliveryId = header(request, "X-GitHub-Delivery");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId)) {
    return json({ error: "Invalid GitHub delivery ID." }, 400);
  }
  if (!isExactJsonContentType(header(request, "Content-Type"))) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  let rawBody;
  try {
    rawBody = await readBoundedBody(request, MAX_RESEARCH_WEBHOOK_BYTES);
  } catch (error) {
    if (error instanceof ResearchWebhookError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Could not read webhook body." }, 400);
  }
  const signatureValid = await verifyGithubSignature(
    env.APC_CONTENT_OS_GITHUB_WEBHOOK_SECRET,
    rawBody,
    header(request, "X-Hub-Signature-256"),
  );
  if (!signatureValid) return json({ error: "Invalid webhook signature." }, 401);

  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return json({ error: "Webhook body is not valid UTF-8 JSON." }, 400);
  }

  let bundle;
  try {
    bundle = parseResearchWebhook(payload);
  } catch (error) {
    if (error instanceof ResearchWebhookError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Webhook validation failed." }, 400);
  }

  const payloadHash = await sha256Hex(encoder.encode(canonicalResearchJson(bundle)));
  const receivedAt = new Date().toISOString();
  const database = env.APC_CONTENT_OS_DB;
  let classification;
  try {
    classification = await existingClassification(database, deliveryId, bundle.run_id, payloadHash);
  } catch (error) {
    console.error(JSON.stringify({ message: "Research idempotency check failed", error: String(error?.message || error) }));
    return json({ error: "Research ingestion is unavailable." }, 503);
  }

  if (classification === "duplicate") {
    return json({ status: "duplicate", runId: bundle.run_id, payloadHash });
  }
  if (classification === "conflict") {
    await recordConflict(database, deliveryId, bundle.run_id, receivedAt, payloadHash);
    return json({ error: "Run ID already exists with different content.", code: "run_id_payload_conflict" }, 409);
  }

  try {
    await database.batch(acceptedStatements(database, deliveryId, bundle, receivedAt, payloadHash));
    return json({
      status: "accepted",
      runId: bundle.run_id,
      payloadHash,
      findingCount: bundle.findings.length,
      topicCount: bundle.topic_candidates.length,
    }, 202);
  } catch (error) {
    try {
      classification = await existingClassification(database, deliveryId, bundle.run_id, payloadHash);
      if (classification === "duplicate") {
        return json({ status: "duplicate", runId: bundle.run_id, payloadHash });
      }
      if (classification === "conflict") {
        await recordConflict(database, deliveryId, bundle.run_id, receivedAt, payloadHash);
        return json({ error: "Run ID already exists with different content.", code: "run_id_payload_conflict" }, 409);
      }
    } catch {
      // The generic fail-closed response below avoids exposing database details.
    }
    console.error(JSON.stringify({ message: "Research ingestion failed", error: String(error?.message || error) }));
    return json({ error: "Research ingestion is unavailable." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return Response.json(
    { error: "Only POST is supported for research ingestion." },
    { status: 405, headers: { "Allow": "POST", "Cache-Control": "private, no-store" } },
  );
}
