import {
  assertValidResearchBundle,
  canonicalResearchJson,
} from "../../../content-os/research-schema.js";

export const RESEARCH_FEED_SCHEMA = "apc.research_feed.v1";
const MAX_DECISION_BODY_BYTES = 8 * 1024;
const MAX_RUNS = 52;
const MAX_CURSOR_LENGTH = 256;
const encoder = new TextEncoder();

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function researchFeed(runs, items, nextCursor) {
  return json({
    schemaVersion: RESEARCH_FEED_SCHEMA,
    generatedAt: new Date().toISOString(),
    runs,
    items,
    nextCursor,
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function isExactJsonContentType(value) {
  const parts = value.split(";");
  if (parts.shift()?.trim().toLowerCase() !== "application/json") return false;
  if (parts.length === 0) return true;
  if (parts.length !== 1) return false;
  return /^\s*charset\s*=\s*(?:utf-8|"utf-8")\s*$/i.test(parts[0]);
}

function declaredBodyLength(request, maximumBytes) {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) throw new Error("invalid_content_length");
  let declared;
  try {
    declared = BigInt(value);
  } catch {
    throw new Error("invalid_content_length");
  }
  if (declared > BigInt(maximumBytes)) throw new Error("body_too_large");
  return Number(declared);
}

async function readBoundedText(request, maximumBytes) {
  const declared = declaredBodyLength(request, maximumBytes);
  if (!request.body) {
    if (declared !== null && declared !== 0) throw new Error("content_length_mismatch");
    return "";
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "";
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("body too large");
      throw new Error("body_too_large");
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  if (declared !== null && declared !== total) throw new Error("content_length_mismatch");
  return result;
}

function encodeCursor(boundary) {
  return btoa(JSON.stringify({
    generatedAt: boundary.generatedAt,
    runId: boundary.runId,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(raw) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_CURSOR_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return null;
  }
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - raw.length % 4) % 4);
    const parsed = JSON.parse(atob(padded));
    if (!exactKeys(parsed, ["generatedAt", "runId"]) ||
        !isUtcTimestamp(parsed.generatedAt) ||
        typeof parsed.runId !== "string" ||
        !/^apc-weekly-topic-review:\d{4}-W\d{2}$/.test(parsed.runId) ||
        encodeCursor(parsed) !== raw) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getParameters(request) {
  const searchParams = new URL(request.url).searchParams;
  for (const key of searchParams.keys()) {
    if (!["limit", "cursor"].includes(key)) return null;
  }
  if (searchParams.getAll("limit").length > 1 || searchParams.getAll("cursor").length > 1) return null;

  const raw = searchParams.get("limit");
  if (raw !== null && (raw.length > 2 || !/^[1-9]\d?$/.test(raw))) return null;
  const value = raw === null ? 12 : Number(raw);
  if (value > MAX_RUNS) return null;

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor === null ? null : decodeCursor(rawCursor);
  if (rawCursor !== null && cursor === null) return null;
  return { limit: value, cursor };
}

function parseStoredJson(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (!isPlainObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch (error) {
    throw new Error(`${label} is corrupt: ${String(error?.message || error)}`);
  }
}

function isUtcTimestamp(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === normalized;
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStoredRun(row) {
  if (!isPlainObject(row) || typeof row.run_id !== "string") {
    throw new Error("research run row is corrupt");
  }
  const bundle = parseStoredJson(row.bundle_json, `research run ${row.run_id}`);
  assertValidResearchBundle(bundle);
  if (bundle.run_id !== row.run_id) throw new Error(`research run ${row.run_id} has a mismatched bundle ID`);
  if (row.generated_at !== bundle.generated_at ||
      row.status !== bundle.status ||
      row.analytics_status !== bundle.analytics_context.status) {
    throw new Error(`research run ${row.run_id} has mismatched metadata`);
  }
  if (!isUtcTimestamp(row.received_at)) {
    throw new Error(`research run ${row.run_id} has an invalid received timestamp`);
  }
  if (typeof row.payload_hash !== "string" || !/^[0-9a-f]{64}$/.test(row.payload_hash)) {
    throw new Error(`research run ${row.run_id} has an invalid payload hash`);
  }
  const calculatedHash = await sha256Hex(canonicalResearchJson(bundle));
  if (calculatedHash !== row.payload_hash) {
    throw new Error(`research run ${row.run_id} failed its payload integrity check`);
  }
  return bundle;
}

function expectedItems(bundle, receivedAt) {
  const items = new Map();
  for (const finding of bundle.findings) {
    const itemId = `${bundle.run_id}|${finding.id}`;
    items.set(itemId, {
      itemId,
      runId: bundle.run_id,
      type: "finding",
      title: finding.title,
      createdAt: receivedAt,
      data: finding,
    });
  }
  for (const topic of bundle.topic_candidates) {
    const itemId = `${bundle.run_id}|${topic.id}`;
    items.set(itemId, {
      itemId,
      runId: bundle.run_id,
      type: "topic",
      title: topic.hook,
      createdAt: receivedAt,
      data: topic,
    });
  }
  return items;
}

export async function onRequestGet({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  const parameters = getParameters(request);
  if (parameters === null) {
    return json({ error: `Query parameters must contain at most one valid limit from 1 to ${MAX_RUNS} and one valid cursor.` }, 400);
  }
  const { limit, cursor } = parameters;

  try {
    let runSql = `SELECT
      run_id, generated_at, received_at, status, analytics_status, payload_hash, bundle_json
      FROM research_runs`;
    const bindings = [];
    if (cursor) {
      runSql += ` WHERE (generated_at < ? OR (generated_at = ? AND run_id < ?))`;
      bindings.push(cursor.generatedAt, cursor.generatedAt, cursor.runId);
    }
    runSql += ` ORDER BY generated_at DESC, run_id DESC LIMIT ?`;
    bindings.push(limit + 1);
    const runQuery = await env.APC_CONTENT_OS_DB.prepare(runSql)
      .bind(...bindings)
      .all();
    const fetchedRunRows = runQuery.results || [];
    const hasMore = fetchedRunRows.length > limit;
    const runRows = fetchedRunRows.slice(0, limit);
    if (!runRows.length) {
      return researchFeed([], [], null);
    }

    const runIds = runRows.map(row => row.run_id);
    const placeholders = runIds.map(() => "?").join(", ");
    const itemQuery = await env.APC_CONTENT_OS_DB.prepare(`SELECT
      i.item_id, i.run_id, i.item_type, i.title, i.created_at, i.item_json,
      COALESCE(d.decision, 'new') AS decision, d.decided_at
      FROM research_items i
      LEFT JOIN research_decisions d ON d.decision_id = (
        SELECT latest.decision_id FROM research_decisions latest
        WHERE latest.item_id = i.item_id
        ORDER BY latest.decision_id DESC LIMIT 1
      )
      WHERE i.run_id IN (${placeholders})
      ORDER BY i.created_at DESC, i.item_type ASC, i.item_id ASC`)
      .bind(...runIds)
      .all();

    const runs = [];
    const verifiedRuns = new Map();
    for (const row of runRows) {
      if (verifiedRuns.has(row.run_id)) throw new Error(`research run ${row.run_id} is duplicated`);
      const bundle = await verifyStoredRun(row);
      verifiedRuns.set(row.run_id, { row, bundle, items: expectedItems(bundle, row.received_at) });
      runs.push({
        runId: row.run_id,
        generatedAt: row.generated_at,
        receivedAt: row.received_at,
        status: row.status,
        analyticsStatus: row.analytics_status,
        payloadHash: row.payload_hash,
        analyticsContext: bundle.analytics_context,
        sources: bundle.sources,
      });
    }

    const seenItems = new Set();
    const items = [];
    for (const row of itemQuery.results || []) {
      if (!isPlainObject(row) || typeof row.item_id !== "string" || typeof row.run_id !== "string") {
        throw new Error("research item row is corrupt");
      }
      const verifiedRun = verifiedRuns.get(row.run_id);
      const expected = verifiedRun?.items.get(row.item_id);
      if (!verifiedRun || !expected || seenItems.has(row.item_id)) {
        throw new Error(`research item ${row.item_id} does not belong to its validated bundle`);
      }
      if (row.item_type !== expected.type || row.title !== expected.title || row.created_at !== expected.createdAt) {
        throw new Error(`research item ${row.item_id} has mismatched metadata`);
      }
      const data = parseStoredJson(row.item_json, `research item ${row.item_id}`);
      if (canonicalResearchJson(data) !== canonicalResearchJson(expected.data)) {
        throw new Error(`research item ${row.item_id} does not match its validated bundle item`);
      }
      if (!['new', 'used', 'archived'].includes(row.decision)) {
        throw new Error(`research item ${row.item_id} has an invalid decision`);
      }
      if ((row.decision === "new" && row.decided_at != null) ||
          (row.decision !== "new" && !isUtcTimestamp(row.decided_at))) {
        throw new Error(`research item ${row.item_id} has invalid decision metadata`);
      }
      seenItems.add(row.item_id);
      items.push({
        itemId: row.item_id,
        sourceItemId: data.id,
        runId: row.run_id,
        type: row.item_type,
        title: row.title,
        createdAt: row.created_at,
        decision: row.decision,
        decidedAt: row.decided_at || null,
        data,
      });
    }
    for (const { items: expected } of verifiedRuns.values()) {
      for (const itemId of expected.keys()) {
        if (!seenItems.has(itemId)) throw new Error(`research item ${itemId} is missing`);
      }
    }
    const lastRun = runs.at(-1);
    const nextCursor = hasMore ? encodeCursor({
      generatedAt: lastRun.generatedAt,
      runId: lastRun.runId,
    }) : null;
    return researchFeed(runs, items, nextCursor);
  } catch (error) {
    console.error(JSON.stringify({ message: "Research feed read failed", error: String(error?.message || error) }));
    return json({ error: "Research feed is unavailable." }, 503);
  }
}

function validItemId(value) {
  return typeof value === "string" && value.length <= 260 &&
    /^apc-weekly-topic-review:\d{4}-W\d{2}\|(finding|topic):[A-Za-z0-9._-]{4,100}$/.test(value);
}

function validRequestId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function existingDecision(database, requestId) {
  return database.prepare(`SELECT request_id, item_id, decision, decided_at
    FROM research_decisions WHERE request_id = ?`).bind(requestId).first();
}

export async function onRequestPost({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  if (request.url.includes("?")) {
    return json({ error: "Decision requests do not accept query parameters." }, 400);
  }
  if (request.headers.get("X-APC-Content-OS") !== "1") {
    return json({ error: "Missing Content OS request header." }, 400);
  }
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin writes are not allowed." }, 403);
  }
  if (!isExactJsonContentType(request.headers.get("Content-Type") || "")) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  let raw;
  try {
    raw = await readBoundedText(request, MAX_DECISION_BODY_BYTES);
  } catch (error) {
    if (error?.message === "body_too_large") return json({ error: "Request body is too large." }, 413);
    if (["invalid_content_length", "content_length_mismatch"].includes(error?.message)) {
      return json({ error: "Content-Length is invalid or does not match the request body." }, 400);
    }
    return json({ error: "Request body is not valid UTF-8." }, 400);
  }
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Request body is not valid JSON." }, 400); }
  if (!exactKeys(payload, ["itemId", "decision", "requestId"])) {
    return json({ error: "Decision request does not match the expected schema." }, 400);
  }
  if (!validItemId(payload.itemId) || !validRequestId(payload.requestId) || !["used", "archive"].includes(payload.decision)) {
    return json({ error: "Decision request contains invalid values." }, 400);
  }
  const storedDecision = payload.decision === "archive" ? "archived" : "used";
  const database = env.APC_CONTENT_OS_DB;

  try {
    let existing = await existingDecision(database, payload.requestId);
    if (existing) {
      if (existing.item_id === payload.itemId && existing.decision === storedDecision) {
        return json({
          status: "duplicate",
          itemId: existing.item_id,
          decision: existing.decision,
          decidedAt: existing.decided_at,
          requestId: existing.request_id,
        });
      }
      return json({ error: "Request ID has already been used for another decision." }, 409);
    }

    const item = await database.prepare("SELECT item_id FROM research_items WHERE item_id = ?")
      .bind(payload.itemId)
      .first();
    if (!item) return json({ error: "Research item was not found." }, 404);

    const decidedAt = new Date().toISOString();
    try {
      await database.prepare(`INSERT INTO research_decisions
        (item_id, decision, decided_at, request_id) VALUES (?, ?, ?, ?)`)
        .bind(payload.itemId, storedDecision, decidedAt, payload.requestId)
        .run();
    } catch (error) {
      existing = await existingDecision(database, payload.requestId);
      if (existing && existing.item_id === payload.itemId && existing.decision === storedDecision) {
        return json({
          status: "duplicate",
          itemId: existing.item_id,
          decision: existing.decision,
          decidedAt: existing.decided_at,
          requestId: existing.request_id,
        });
      }
      if (existing) return json({ error: "Request ID has already been used for another decision." }, 409);
      throw error;
    }
    return json({
      status: "recorded",
      itemId: payload.itemId,
      decision: storedDecision,
      decidedAt,
      requestId: payload.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Research decision write failed", error: String(error?.message || error) }));
    return json({ error: "Research decision is unavailable." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return Response.json(
    { error: "Only GET and POST are supported for research." },
    { status: 405, headers: { "Allow": "GET, POST", "Cache-Control": "private, no-store" } },
  );
}
