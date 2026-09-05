import {
  isCanonicalUtcTimestamp,
  validateAnalyticsSubmission,
} from "../../../../content-os/analytics.js";
import { onRequestPost as appendAnalytics } from "../analytics.js";
import { verifyGithubSignature } from "./research-github.js";

export const MAX_ANALYTICS_INGEST_BYTES = 256 * 1024;
const MAX_RECORDS = 25;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function exactKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}

async function readBoundedBody(request) {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_ANALYTICS_INGEST_BYTES)) {
    throw new Error("invalid_content_length");
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ANALYTICS_INGEST_BYTES) {
        await reader.cancel("body too large");
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declared !== null && Number(declared) !== total) throw new Error("content_length_mismatch");
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function validEnvelope(value) {
  if (!exactKeys(value, ["deliveryId", "generatedAt", "records", "schemaVersion"])) return false;
  if (value.schemaVersion !== "apc.analytics-github.v1") return false;
  if (typeof value.deliveryId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.deliveryId)) return false;
  if (!isCanonicalUtcTimestamp(value.generatedAt)) return false;
  const generatedAt = Date.parse(value.generatedAt);
  const now = Date.now();
  if (generatedAt < now - MAX_AGE_MS || generatedAt > now + MAX_FUTURE_SKEW_MS) return false;
  return Array.isArray(value.records) && value.records.length <= MAX_RECORDS &&
    value.records.every(record => validateAnalyticsSubmission(record).valid);
}

export async function onRequestPost({ request, env }) {
  if (env.APC_CONTENT_OS_AUTOMATION_ENABLED !== "true" ||
      env.APC_CONTENT_OS_META_GITHUB_SYNC_ENABLED !== "true" ||
      !env.APC_CONTENT_OS_ANALYTICS_INGEST_SECRET) {
    return json({ error: "Automatic analytics ingestion is not configured.", code: "not_configured" }, 503);
  }
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical analytics storage is unavailable.", code: "database_unavailable" }, 503);
  if (request.headers.get("X-APC-Source") !== "apc-ai-os-meta-insights") {
    return json({ error: "Analytics source is not approved.", code: "unapproved_source" }, 403);
  }
  const mediaType = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return json({ error: "Content-Type must be application/json.", code: "unsupported_content_type" }, 415);

  let rawBody;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    const code = String(error?.message || "invalid_body");
    return json({ error: "Analytics request body is invalid.", code }, code === "body_too_large" ? 413 : 400);
  }
  if (!await verifyGithubSignature(
    env.APC_CONTENT_OS_ANALYTICS_INGEST_SECRET,
    rawBody,
    request.headers.get("X-Hub-Signature-256") || "",
  )) {
    return json({ error: "Invalid analytics signature.", code: "invalid_signature" }, 401);
  }

  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return json({ error: "Analytics body is not valid UTF-8 JSON.", code: "invalid_json" }, 400);
  }
  if (!validEnvelope(envelope)) return json({ error: "Analytics envelope is invalid.", code: "invalid_envelope" }, 422);

  let accepted = 0;
  let duplicates = 0;
  for (const record of envelope.records) {
    const internalUrl = new URL("/api/content-os/analytics", request.url);
    const response = await appendAnalytics({
      env,
      request: new Request(internalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": internalUrl.origin,
          "X-APC-Content-OS": "1",
          "X-APC-Analytics-Expected-Revision": "0",
        },
        body: JSON.stringify(record),
      }),
    });
    if (response.status === 201) accepted += 1;
    else if (response.status === 200) duplicates += 1;
    else {
      let failure = null;
      try { failure = await response.json(); } catch {}
      return json({
        error: "An analytics record could not be stored.",
        code: failure?.code || "record_rejected",
        accepted,
        duplicates,
      }, response.status >= 400 && response.status < 500 ? response.status : 503);
    }
  }

  return json({
    schemaVersion: "apc.analytics-github.v1",
    status: "accepted",
    deliveryId: envelope.deliveryId,
    accepted,
    duplicates,
  }, 202);
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "Only POST is supported.", code: "method_not_allowed" }, 405);
}
