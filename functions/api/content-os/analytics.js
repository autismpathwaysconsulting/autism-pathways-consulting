import {
  ANALYTICS_CHECKPOINTS,
  ANALYTICS_SCHEMA_VERSION,
  assertValidAnalyticsSnapshot,
  assertValidPublication,
  isCanonicalUtcTimestamp,
  validateAnalyticsSubmission,
} from "../../../content-os/analytics.js";

const MAX_BODY_BYTES = 64 * 1024;
const RETENTION_POLICY = "indefinite";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CHECKPOINT_WINDOWS_MS = Object.freeze({
  "24h": Object.freeze({ minimum: 18 * 60 * 60 * 1000, maximum: 36 * 60 * 60 * 1000 }),
  "7d": Object.freeze({ minimum: 6 * 24 * 60 * 60 * 1000, maximum: 9 * 24 * 60 * 60 * 1000 }),
  "28d": Object.freeze({ minimum: 25 * 24 * 60 * 60 * 1000, maximum: 35 * 24 * 60 * 60 * 1000 }),
});
const CHECKPOINT_WINDOW_GUIDANCE = Object.freeze({
  "24h": "18 to 36 hours after publication",
  "7d": "6 to 9 days after publication",
  "28d": "25 to 35 days after publication",
});
const EXPECTED_REVISION_HEADER = "X-APC-Analytics-Expected-Revision";
const INTENT_HEADER = "X-APC-Content-OS";
const GET_QUERY_KEYS = new Set(["view", "publicationId", "checkpoint", "limit", "cursor"]);

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function error(status, code, message, extra = {}) {
  return json({ error: message, code, ...extra }, status);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readLimitedText(request, maximumBytes) {
  if (!request.body) return { tooLarge: false, text: "" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("Request body exceeds the analytics limit.");
        return { tooLarge: true, text: null };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { tooLarge: false, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
}

function parseExpectedRevision(request) {
  const raw = request.headers.get(EXPECTED_REVISION_HEADER);
  if (raw === null || !/^(?:0|[1-9]\d*)$/.test(raw)) return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) ? revision : null;
}

function validStableId(value, prefix) {
  return typeof value === "string" && new RegExp(`^${prefix}_[a-zA-Z0-9-]{8,90}$`).test(value);
}

function validIdempotencyKey(value) {
  return typeof value === "string" && /^[a-zA-Z0-9:_-]{8,120}$/.test(value);
}

function utcIso(value) {
  return isCanonicalUtcTimestamp(value);
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  if (typeof value !== "string" || !value || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Cursor is invalid.");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeCursor(row) {
  return base64UrlEncode(JSON.stringify({ createdAt: row.created_at, snapshotId: row.snapshot_id }));
}

function decodeCursor(value) {
  let parsed;
  try { parsed = JSON.parse(base64UrlDecode(value)); } catch { throw new Error("Cursor is invalid."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Cursor is invalid.");
  if (Object.keys(parsed).sort().join(",") !== "createdAt,snapshotId") throw new Error("Cursor is invalid.");
  if (!utcIso(parsed.createdAt) || !validStableId(parsed.snapshotId, "snap")) throw new Error("Cursor is invalid.");
  return parsed;
}

function parseGetQuery(request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!GET_QUERY_KEYS.has(key) || params.getAll(key).length !== 1) throw new Error(`Query parameter ${key} is not allowed or is repeated.`);
  }

  const rawView = params.get("view");
  const view = rawView === null ? "latest" : rawView;
  if (!["latest", "list"].includes(view)) throw new Error("view must be latest or list.");

  const publicationId = params.get("publicationId");
  if (publicationId !== null && !validStableId(publicationId, "pub")) throw new Error("publicationId is invalid.");

  const checkpoint = params.get("checkpoint");
  if (checkpoint !== null && !ANALYTICS_CHECKPOINTS.includes(checkpoint)) throw new Error("checkpoint is invalid.");

  const rawLimit = params.get("limit");
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) throw new Error("limit must be a positive integer.");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error(`limit must be between 1 and ${MAX_LIMIT}.`);

  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? null : decodeCursor(rawCursor);
  return { view, publicationId, checkpoint, limit, cursor };
}

async function parseStoredRecord(row, expectedIdempotencyKey = null) {
  if (!row) return null;
  const publication = JSON.parse(row.publication_json);
  const snapshot = JSON.parse(row.snapshot_json);
  assertValidPublication(publication);
  assertValidAnalyticsSnapshot(snapshot);
  const revision = Number(row.revision);
  const archived = Number(row.archived);
  if (!Number.isSafeInteger(revision) || revision < 1 || !utcIso(row.created_at) || ![0, 1].includes(archived)) {
    throw new Error("Stored analytics record metadata is invalid.");
  }
  if (
    row.publication_id !== publication.publicationId ||
    row.snapshot_publication_id !== publication.publicationId ||
    snapshot.publicationId !== publication.publicationId ||
    row.platform !== publication.platform ||
    row.post_ref !== publication.postRef ||
    row.published_at !== publication.publishedAt ||
    row.snapshot_id !== snapshot.snapshotId ||
    row.checkpoint !== snapshot.checkpoint ||
    row.captured_at !== snapshot.capturedAt ||
    !validIdempotencyKey(row.idempotency_key) ||
    (expectedIdempotencyKey !== null && row.idempotency_key !== expectedIdempotencyKey)
  ) {
    throw new Error("Stored analytics record metadata does not match its validated payload.");
  }
  const [publicationHash, snapshotHash] = await Promise.all([
    sha256Hex(canonicalJson(publication)),
    sha256Hex(canonicalJson({ snapshot, idempotencyKey: row.idempotency_key })),
  ]);
  if (publicationHash !== row.publication_hash || snapshotHash !== row.snapshot_hash) {
    throw new Error("Stored analytics record integrity check failed.");
  }
  return {
    publication,
    snapshot,
    revision,
    createdAt: row.created_at,
    archived: Boolean(archived),
  };
}

function changeCount(result) {
  return Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
}

async function findByIdempotencyKey(database, key) {
  return database.prepare(`SELECT
      p.publication_id AS publication_id, p.platform, p.post_ref, p.published_at,
      p.publication_json, p.payload_hash AS publication_hash,
      s.publication_id AS snapshot_publication_id, s.snapshot_id, s.checkpoint,
      s.captured_at, s.idempotency_key,
      s.snapshot_json, s.payload_hash AS snapshot_hash,
      s.revision, s.created_at, s.archived
    FROM content_analytics_snapshots s
    JOIN content_publications p ON p.publication_id = s.publication_id
    WHERE s.idempotency_key = ?
    LIMIT 1`).bind(key).first();
}

async function findBySnapshotId(database, snapshotId) {
  return database.prepare(`SELECT
      p.publication_id AS publication_id, p.platform, p.post_ref, p.published_at,
      p.publication_json, p.payload_hash AS publication_hash,
      s.publication_id AS snapshot_publication_id, s.snapshot_id, s.checkpoint,
      s.captured_at, s.idempotency_key,
      s.snapshot_json, s.payload_hash AS snapshot_hash,
      s.revision, s.created_at, s.archived
    FROM content_analytics_snapshots s
    JOIN content_publications p ON p.publication_id = s.publication_id
    WHERE s.snapshot_id = ?
    LIMIT 1`).bind(snapshotId).first();
}

async function findPublicationConflict(database, publication) {
  return database.prepare(`SELECT publication_id, platform, post_ref, payload_hash, publication_json
    FROM content_publications
    WHERE publication_id = ? OR (platform = ? AND post_ref = ?)
    ORDER BY CASE WHEN publication_id = ? THEN 0 ELSE 1 END
    LIMIT 1`).bind(
      publication.publicationId,
      publication.platform,
      publication.postRef,
      publication.publicationId,
    ).first();
}

async function latestRevision(database, publicationId, checkpoint) {
  const row = await database.prepare(`SELECT COALESCE(MAX(revision), 0) AS revision
    FROM content_analytics_snapshots
    WHERE publication_id = ? AND checkpoint = ?`).bind(publicationId, checkpoint).first();
  return Number(row?.revision || 0);
}

function validateSourceConsistency(publication, snapshot) {
  const sourcePlatforms = {
    "Meta Business Suite": ["Instagram", "Facebook"],
    "Instagram Insights": ["Instagram"],
    "TikTok Analytics": ["TikTok"],
    "YouTube Studio": ["YouTube"],
    "Legacy Content OS": ["Instagram", "TikTok", "Facebook", "YouTube"],
  };
  if (!sourcePlatforms[snapshot.sourceSystem]?.includes(publication.platform)) {
    return "sourceSystem does not match the publication platform.";
  }
  const legacyMethod = snapshot.collectionMethod === "legacy_migration";
  const legacySource = snapshot.sourceSystem === "Legacy Content OS";
  if (legacyMethod !== legacySource) return "Legacy collection method and source system must be used together.";
  if (snapshot.checkpoint === "72h_legacy" && !legacyMethod) return "72h_legacy is reserved for legacy migration records.";
  if (snapshot.collectionMethod === "meta_connector" && !["Meta Business Suite", "Instagram Insights"].includes(snapshot.sourceSystem)) {
    return "meta_connector may only use an approved Meta source system.";
  }
  if (snapshot.collectionMethod === "tiktok_connector" && snapshot.sourceSystem !== "TikTok Analytics") {
    return "tiktok_connector may only use TikTok Analytics.";
  }
  if (snapshot.collectionMethod === "youtube_connector" && snapshot.sourceSystem !== "YouTube Studio") {
    return "youtube_connector may only use YouTube Studio.";
  }
  return null;
}

function validateTimestamps(publication, snapshot, now) {
  const nowTime = Date.parse(now);
  if (publication.publishedAt !== null && Date.parse(publication.publishedAt) > nowTime + FUTURE_CLOCK_SKEW_MS) {
    return "publishedAt is too far in the future.";
  }
  const requiresCheckpointTiming = snapshot.collectionMethod !== "legacy_migration";
  if (requiresCheckpointTiming && publication.publishedAt === null) {
    return "publishedAt is required for manual and connector analytics snapshots.";
  }
  if (requiresCheckpointTiming && snapshot.capturedAt === null) {
    return "capturedAt is required for manual and connector analytics snapshots.";
  }
  if (snapshot.capturedAt !== null) {
    const capturedTime = Date.parse(snapshot.capturedAt);
    if (capturedTime > nowTime + FUTURE_CLOCK_SKEW_MS) return "capturedAt is too far in the future.";
    if (publication.publishedAt !== null && capturedTime < Date.parse(publication.publishedAt)) {
      return "capturedAt must not be earlier than publishedAt.";
    }
    if (requiresCheckpointTiming) {
      const window = CHECKPOINT_WINDOWS_MS[snapshot.checkpoint];
      if (!window) return "checkpoint does not have an approved capture window.";
      const elapsed = capturedTime - Date.parse(publication.publishedAt);
      if (elapsed < window.minimum || elapsed > window.maximum) {
        return `${snapshot.checkpoint} must be captured ${CHECKPOINT_WINDOW_GUIDANCE[snapshot.checkpoint]}.`;
      }
    }
  }
  return null;
}

async function idempotentResponse(row, publicationHash, snapshotHash, expectedIdempotencyKey) {
  if (!row) return null;
  if (row.publication_hash !== publicationHash || row.snapshot_hash !== snapshotHash) {
    return error(409, "idempotency_key_reuse", "The idempotency key is already associated with different analytics data.");
  }
  return json({
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    idempotent: true,
    record: await parseStoredRecord(row, expectedIdempotencyKey),
  });
}

async function classifyWriteConflict(database, payload, publicationHash, snapshotHash, expectedRevision) {
  const duplicate = await findByIdempotencyKey(database, payload.idempotencyKey);
  const duplicateResponse = await idempotentResponse(duplicate, publicationHash, snapshotHash, payload.idempotencyKey);
  if (duplicateResponse) return duplicateResponse;

  const snapshotCollision = await findBySnapshotId(database, payload.snapshot.snapshotId);
  if (snapshotCollision) {
    await parseStoredRecord(snapshotCollision);
    return error(409, "snapshot_id_conflict", "The snapshot ID is already in use.");
  }

  const publicationConflict = await findPublicationConflict(database, payload.publication);
  if (publicationConflict && (
    publicationConflict.publication_id !== payload.publication.publicationId ||
    publicationConflict.payload_hash !== publicationHash
  )) {
    return error(409, "publication_conflict", "The publication ID or platform post reference is already associated with different data.");
  }

  const currentRevision = await latestRevision(database, payload.snapshot.publicationId, payload.snapshot.checkpoint);
  if (currentRevision !== expectedRevision) {
    return error(409, "revision_conflict", "The analytics checkpoint changed before this revision was saved.", { currentRevision });
  }
  return error(409, "write_conflict", "The analytics revision could not be appended safely.", { currentRevision });
}

export async function onRequestGet({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return error(503, "database_unavailable", "Canonical analytics storage is not configured.");

  let query;
  try { query = parseGetQuery(request); } catch (queryError) {
    return error(400, "invalid_query", String(queryError?.message || queryError));
  }

  try {
    const conditions = ["s.archived = 0"];
    const bindings = [];

    if (query.publicationId) {
      conditions.push("s.publication_id = ?");
      bindings.push(query.publicationId);
    }
    if (query.checkpoint) {
      conditions.push("s.checkpoint = ?");
      bindings.push(query.checkpoint);
    }
    if (query.view === "latest") {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM content_analytics_snapshots newer
        WHERE newer.publication_id = s.publication_id
          AND newer.checkpoint = s.checkpoint
          AND newer.archived = 0
          AND newer.revision > s.revision
      )`);
    }
    if (query.cursor) {
      conditions.push("(s.created_at < ? OR (s.created_at = ? AND s.snapshot_id < ?))");
      bindings.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.snapshotId);
    }

    bindings.push(query.limit + 1);
    const result = await env.APC_CONTENT_OS_DB.prepare(`SELECT
        p.publication_id AS publication_id, p.platform, p.post_ref, p.published_at,
        p.publication_json, p.payload_hash AS publication_hash,
        s.publication_id AS snapshot_publication_id, s.snapshot_id, s.checkpoint,
        s.captured_at, s.idempotency_key,
        s.snapshot_json, s.payload_hash AS snapshot_hash,
        s.revision, s.created_at, s.archived
      FROM content_analytics_snapshots s
      JOIN content_publications p ON p.publication_id = s.publication_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY s.created_at DESC, s.snapshot_id DESC
      LIMIT ?`).bind(...bindings).all();

    const rows = Array.isArray(result?.results) ? result.results : [];
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const records = await Promise.all(pageRows.map(row => parseStoredRecord(row)));
    return json({
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      view: query.view,
      records,
      nextCursor: hasMore && pageRows.length ? encodeCursor(pageRows[pageRows.length - 1]) : null,
      retentionPolicy: RETENTION_POLICY,
    });
  } catch (databaseError) {
    console.error(JSON.stringify({ message: "Analytics read failed", error: String(databaseError?.message || databaseError) }));
    return error(503, "database_unavailable", "Canonical analytics data is unavailable.");
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return error(503, "database_unavailable", "Canonical analytics storage is not configured.");
  if (new URL(request.url).search) return error(400, "invalid_query", "POST does not accept query parameters.");
  if (request.headers.get(INTENT_HEADER) !== "1") return error(400, "missing_intent_header", `Missing ${INTENT_HEADER} request header.`);

  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return error(403, "cross_origin_write", "Cross-origin analytics writes are not allowed.");
  }
  const mediaType = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return error(415, "unsupported_content_type", "Content-Type must be application/json.");
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    return Number(declaredLength) > MAX_BODY_BYTES
      ? error(413, "body_too_large", "Request body is too large.")
      : error(400, "invalid_content_length", "Content-Length is invalid.");
  }

  let body;
  try { body = await readLimitedText(request, MAX_BODY_BYTES); } catch {
    return error(400, "invalid_body", "Request body could not be read as UTF-8 JSON.");
  }
  if (body.tooLarge) return error(413, "body_too_large", "Request body is too large.");

  let payload;
  try { payload = JSON.parse(body.text); } catch {
    return error(400, "invalid_json", "Request body is not valid JSON.");
  }
  const validation = validateAnalyticsSubmission(payload);
  if (!validation.valid) return error(400, "invalid_schema", validation.error);

  const expectedRevision = parseExpectedRevision(request);
  if (expectedRevision === null) {
    return error(400, "invalid_expected_revision", `${EXPECTED_REVISION_HEADER} must be a non-negative safe integer.`);
  }

  const now = new Date().toISOString();
  const sourceError = validateSourceConsistency(payload.publication, payload.snapshot);
  if (sourceError) return error(400, "invalid_source", sourceError);
  const timestampError = validateTimestamps(payload.publication, payload.snapshot, now);
  if (timestampError) return error(400, "invalid_timestamp", timestampError);

  const publicationJson = canonicalJson(payload.publication);
  const snapshotJson = canonicalJson(payload.snapshot);
  const [publicationHash, snapshotHash] = await Promise.all([
    sha256Hex(publicationJson),
    sha256Hex(canonicalJson({ snapshot: payload.snapshot, idempotencyKey: payload.idempotencyKey })),
  ]);

  try {
    const duplicate = await findByIdempotencyKey(env.APC_CONTENT_OS_DB, payload.idempotencyKey);
    const duplicateResponse = await idempotentResponse(
      duplicate,
      publicationHash,
      snapshotHash,
      payload.idempotencyKey,
    );
    if (duplicateResponse) return duplicateResponse;

    const publicationConflict = await findPublicationConflict(env.APC_CONTENT_OS_DB, payload.publication);
    if (publicationConflict && (
      publicationConflict.publication_id !== payload.publication.publicationId ||
      publicationConflict.payload_hash !== publicationHash
    )) {
      return error(409, "publication_conflict", "The publication ID or platform post reference is already associated with different data.");
    }

    const currentRevision = await latestRevision(
      env.APC_CONTENT_OS_DB,
      payload.snapshot.publicationId,
      payload.snapshot.checkpoint,
    );
    if (currentRevision !== expectedRevision) {
      return error(409, "revision_conflict", "The analytics checkpoint changed before this revision was saved.", { currentRevision });
    }

    const nextRevision = expectedRevision + 1;
    const statements = [
      env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_publications (
          publication_id, platform, post_ref, published_at, created_at,
          payload_hash, publication_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING`).bind(
          payload.publication.publicationId,
          payload.publication.platform,
          payload.publication.postRef,
          payload.publication.publishedAt,
          now,
          publicationHash,
          publicationJson,
        ),
      env.APC_CONTENT_OS_DB.prepare(`INSERT INTO content_analytics_snapshots (
          snapshot_id, publication_id, checkpoint, revision, captured_at, created_at,
          archived, payload_hash, idempotency_key, snapshot_json
        )
        SELECT ?, ?, ?, ?, ?, ?, 0, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM content_publications
          WHERE publication_id = ? AND payload_hash = ?
        )
        AND (
          SELECT COALESCE(MAX(revision), 0)
          FROM content_analytics_snapshots
          WHERE publication_id = ? AND checkpoint = ?
        ) = ?`).bind(
          payload.snapshot.snapshotId,
          payload.snapshot.publicationId,
          payload.snapshot.checkpoint,
          nextRevision,
          payload.snapshot.capturedAt,
          now,
          snapshotHash,
          payload.idempotencyKey,
          snapshotJson,
          payload.publication.publicationId,
          publicationHash,
          payload.snapshot.publicationId,
          payload.snapshot.checkpoint,
          expectedRevision,
        ),
    ];

    let batchResult;
    try {
      batchResult = await env.APC_CONTENT_OS_DB.batch(statements);
    } catch (writeError) {
      const classified = await classifyWriteConflict(
        env.APC_CONTENT_OS_DB,
        payload,
        publicationHash,
        snapshotHash,
        expectedRevision,
      );
      if (classified.status === 409 || classified.status === 200) return classified;
      throw writeError;
    }

    if (changeCount(batchResult[batchResult.length - 1]) !== 1) {
      return classifyWriteConflict(
        env.APC_CONTENT_OS_DB,
        payload,
        publicationHash,
        snapshotHash,
        expectedRevision,
      );
    }

    const stored = await findByIdempotencyKey(env.APC_CONTENT_OS_DB, payload.idempotencyKey);
    if (!stored) throw new Error("Inserted analytics revision could not be read back.");
    return json({
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      idempotent: false,
      record: await parseStoredRecord(stored, payload.idempotencyKey),
    }, 201, { ETag: `"${payload.snapshot.publicationId}:${payload.snapshot.checkpoint}:${nextRevision}"` });
  } catch (databaseError) {
    console.error(JSON.stringify({ message: "Analytics write failed", error: String(databaseError?.message || databaseError) }));
    return error(503, "database_unavailable", "Canonical analytics storage is unavailable.");
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({
    error: "Only GET and POST are supported for analytics.",
    code: "method_not_allowed",
  }, 405, { Allow: "GET, POST" });
}
