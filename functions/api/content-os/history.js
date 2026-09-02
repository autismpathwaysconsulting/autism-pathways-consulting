import { STATE_SCHEMA_VERSION } from "../../../content-os/schema.js";
import {
  hasExactKeys,
  hasValidRestoreProvenance,
  isValidRequestId,
  isValidRevision,
  isValidStateAction,
  json,
  methodNotAllowed,
  parseStoredStateJson,
  readJsonBody,
  sha256Hex,
  validateWriteRequest,
  writeCanonicalState,
} from "./state.js";

const RESTORE_PAYLOAD_KEYS = Object.freeze([
  "expectedRevision",
  "revision",
  "requestId",
]);
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;
const MAX_HISTORY_CURSOR_LENGTH = 128;

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== "string") return false;
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const parsed = new Date(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return pattern.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString() === canonical;
}

function validateHistoryMetadata(row) {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("Stored revision number is invalid.");
  }
  if (!["2.1", "2.2", STATE_SCHEMA_VERSION].includes(row.schema_version)) {
    throw new Error("Stored revision schema version is unsupported.");
  }
  if (row.updated_at !== null && !isCanonicalUtcTimestamp(row.updated_at)) {
    throw new Error("Stored revision timestamp is invalid.");
  }
  if (row.schema_version === STATE_SCHEMA_VERSION) {
    if (
      row.updated_at === null ||
      !isValidStateAction(row.action) ||
      !isValidRequestId(row.request_id) ||
      !hasValidRestoreProvenance(row.action, row.restored_from_revision, row.revision) ||
      !/^[a-f0-9]{64}$/.test(row.state_hash || "")
    ) {
      throw new Error("Stored revision audit metadata is invalid.");
    }
    return;
  }
  if (
    row.action !== "legacy" ||
    row.request_id !== null ||
    row.restored_from_revision !== null ||
    ![null, "legacy-unhashed"].includes(row.state_hash)
  ) {
    throw new Error("Stored legacy revision audit metadata is invalid.");
  }
}

function encodeHistoryCursor(beforeRevision) {
  return btoa(JSON.stringify({ beforeRevision }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeHistoryCursor(raw) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > MAX_HISTORY_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(raw)
  ) {
    return null;
  }
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - raw.length % 4) % 4);
    const parsed = JSON.parse(atob(padded));
    if (
      !hasExactKeys(parsed, ["beforeRevision"]) ||
      !Number.isSafeInteger(parsed.beforeRevision) ||
      parsed.beforeRevision < 1 ||
      encodeHistoryCursor(parsed.beforeRevision) !== raw
    ) {
      return null;
    }
    return parsed.beforeRevision;
  } catch {
    return null;
  }
}

function parseHistoryParameters(request) {
  const url = new URL(request.url);
  if (
    url.searchParams.getAll("limit").length > 1 ||
    url.searchParams.getAll("cursor").length > 1
  ) {
    return null;
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "limit" && key !== "cursor") return null;
  }

  const rawLimit = url.searchParams.get("limit");
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) return null;
  const limit = rawLimit === null ? DEFAULT_HISTORY_LIMIT : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > MAX_HISTORY_LIMIT) return null;

  const rawCursor = url.searchParams.get("cursor");
  const beforeRevision = rawCursor === null ? null : decodeHistoryCursor(rawCursor);
  if (rawCursor !== null && beforeRevision === null) return null;
  return { limit, beforeRevision };
}

async function handleGet({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) {
    return json({ error: "Canonical database is not configured." }, 503);
  }
  const parameters = parseHistoryParameters(request);
  if (parameters === null) {
    return json({ error: `Query parameters must contain at most one valid limit from 1 to ${MAX_HISTORY_LIMIT} and one valid cursor.` }, 400);
  }
  const { limit, beforeRevision } = parameters;

  try {
    const bindings = [];
    const boundary = beforeRevision === null ? "" : "WHERE revision < ?";
    if (beforeRevision !== null) bindings.push(beforeRevision);
    bindings.push(limit + 1);
    const result = await env.APC_CONTENT_OS_DB
      .prepare(`SELECT revision, schema_version, updated_at, action,
        request_id, restored_from_revision, state_hash
        FROM content_os_revisions
        ${boundary}
        ORDER BY revision DESC LIMIT ?`)
      .bind(...bindings)
      .all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const revisions = pageRows.map(row => {
      validateHistoryMetadata(row);
      return {
        revision: row.revision,
        schemaVersion: row.schema_version,
        updatedAt: row.updated_at,
        action: row.action,
        requestId: row.request_id,
        restoredFromRevision: row.restored_from_revision,
        stateHash: row.state_hash,
      };
    });
    return json({
      schemaVersion: STATE_SCHEMA_VERSION,
      revisions,
      nextCursor: hasMore && revisions.length
        ? encodeHistoryCursor(revisions[revisions.length - 1].revision)
        : null,
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Content OS history read failed",
      errorType: String(error?.name || "Error"),
    }));
    return json({ error: "Revision history is unavailable." }, 503);
  }
}

async function handlePost({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) {
    return json({ error: "Canonical database is not configured." }, 503);
  }
  if (new URL(request.url).search) {
    return json({ error: "Restore does not accept query parameters." }, 400);
  }

  const writeFailure = validateWriteRequest(request);
  if (writeFailure) return writeFailure;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  if (!hasExactKeys(payload, RESTORE_PAYLOAD_KEYS)) {
    return json({ error: "Request must contain only expectedRevision, revision, and requestId." }, 400);
  }
  if (!isValidRevision(payload.expectedRevision)) {
    return json({ error: "expectedRevision must be a non-negative safe integer." }, 400);
  }
  if (!isValidRevision(payload.revision)) {
    return json({ error: "revision must be a non-negative safe integer." }, 400);
  }
  if (!isValidRequestId(payload.requestId)) {
    return json({ error: "requestId is invalid." }, 400);
  }

  try {
    const target = await env.APC_CONTENT_OS_DB
      .prepare(`SELECT revision, schema_version, updated_at, action, request_id,
        restored_from_revision, state_hash, state_json
        FROM content_os_revisions WHERE revision = ?`)
      .bind(payload.revision)
      .first();
    if (!target) return json({ error: "Requested revision was not found." }, 404);

    if (!["2.1", "2.2", STATE_SCHEMA_VERSION].includes(target.schema_version)) {
      throw new Error("Requested revision schema version is unsupported.");
    }
    const restoredState = parseStoredStateJson(target.state_json, target.schema_version);
    if (target.schema_version === STATE_SCHEMA_VERSION) {
      const computedHash = await sha256Hex(JSON.stringify(restoredState));
      if (!/^[a-f0-9]{64}$/.test(target.state_hash || "") || target.state_hash !== computedHash) {
        throw new Error("Requested revision hash does not match stored state.");
      }
      if (
        target.updated_at !== restoredState.updatedAt ||
        !target.updated_at ||
        !isValidStateAction(target.action) ||
        !isValidRequestId(target.request_id) ||
        !hasValidRestoreProvenance(
          target.action,
          target.restored_from_revision,
          target.revision,
        )
      ) {
        throw new Error("Requested revision audit metadata is invalid.");
      }
    } else if (
      target.action !== "legacy" ||
      target.request_id !== null ||
      target.restored_from_revision !== null ||
      ![null, "legacy-unhashed"].includes(target.state_hash)
    ) {
      throw new Error("Requested legacy revision audit metadata is invalid.");
    }
    const result = await writeCanonicalState({
      env,
      state: restoredState,
      expectedRevision: payload.expectedRevision,
      action: "restore",
      requestId: payload.requestId,
      restoredFromRevision: payload.revision,
    });
    if (result.conflict) return json(result.record, 409);
    return json({
      ...result.record,
      idempotent: result.idempotent,
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Content OS restore failed",
      errorType: String(error?.name || "Error"),
    }));
    return json({ error: "Revision could not be restored." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return handleGet(context);
  if (context.request.method === "POST") return handlePost(context);
  return methodNotAllowed(["GET", "POST"]);
}

export async function onRequestGet(context) {
  return handleGet(context);
}

export async function onRequestPost(context) {
  return handlePost(context);
}
