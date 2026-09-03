import {
  assertValidContentOsState,
  migrateContentOsState,
  STATE_SCHEMA_VERSION,
} from "../../../content-os/schema.js";

export const MAX_BODY_BYTES = 256 * 1024;

const STATE_PAYLOAD_KEYS = Object.freeze([
  "expectedRevision",
  "state",
  "action",
  "requestId",
]);
export const ALLOWED_STATE_ACTIONS = Object.freeze([
  "edit",
  "import",
  "reset",
  "migration",
  "restore",
]);
const ALLOWED_STATE_ACTION_SET = new Set(ALLOWED_STATE_ACTIONS);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

export function methodNotAllowed(allowed) {
  return json(
    { error: "Method not allowed." },
    405,
    { Allow: allowed.join(", ") },
  );
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isValidRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isValidRequestId(value) {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isValidStateAction(value) {
  return typeof value === "string" && ALLOWED_STATE_ACTION_SET.has(value);
}

export function hasValidRestoreProvenance(action, restoredFromRevision, revision) {
  if (action === "restore") {
    return isValidRevision(restoredFromRevision) &&
      (revision === undefined || restoredFromRevision < revision);
  }
  return restoredFromRevision === null;
}

export function validateWriteRequest(request) {
  if (request.headers.get("X-APC-Content-OS") !== "1") {
    return json({ error: "Missing sync request header." }, 400);
  }

  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin writes are not allowed." }, 403);
  }

  return null;
}

function bodyFailure(status, error) {
  return { ok: false, response: json({ error }, status) };
}

export async function readJsonBody(request) {
  const mediaType = (request.headers.get("Content-Type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return bodyFailure(415, "Content-Type must be application/json.");
  }

  const declaredHeader = request.headers.get("Content-Length");
  if (declaredHeader !== null) {
    if (!/^\d+$/.test(declaredHeader)) {
      return bodyFailure(400, "Content-Length is invalid.");
    }
    if (Number(declaredHeader) > MAX_BODY_BYTES) {
      return bodyFailure(413, "Request body is too large.");
    }
  }

  const chunks = [];
  let totalBytes = 0;
  try {
    if (request.body) {
      const reader = request.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          try { await reader.cancel("Request body is too large."); } catch {}
          return bodyFailure(413, "Request body is too large.");
        }
        chunks.push(value);
      }
    }
  } catch {
    return bodyFailure(400, "Request body could not be read.");
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bodyFailure(400, "Request body must use valid UTF-8.");
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return bodyFailure(400, "Request body is not valid JSON.");
  }
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function parseStoredStateJson(rawJson, storedSchemaVersion) {
  if (typeof rawJson !== "string" || rawJson.length === 0) {
    throw new Error("Stored Content OS state must be a non-empty JSON string.");
  }
  const parsed = JSON.parse(rawJson);
  if (!isPlainObject(parsed)) {
    throw new Error("Stored Content OS state must be a plain object.");
  }
  if (storedSchemaVersion !== undefined && parsed.version !== storedSchemaVersion) {
    throw new Error("Stored Content OS schema metadata does not match its state.");
  }
  return migrateContentOsState(parsed);
}

async function recordFromRow(row) {
  if (!row) return null;
  if (!isValidRevision(row.revision)) {
    throw new Error("Canonical Content OS revision is invalid.");
  }
  if (!["2.1", "2.2", STATE_SCHEMA_VERSION].includes(row.schema_version)) {
    throw new Error("Canonical Content OS schema version is unsupported.");
  }

  let state = null;
  let stateHash = row.state_hash ?? null;
  const restoredFromRevision = row.restored_from_revision;
  if (row.state_json !== null && row.state_json !== undefined) {
    state = parseStoredStateJson(row.state_json, row.schema_version);
    const canonicalJson = JSON.stringify(state);
    const computedHash = await sha256Hex(canonicalJson);

    if (row.schema_version === STATE_SCHEMA_VERSION) {
      if (!/^[a-f0-9]{64}$/.test(stateHash || "") || stateHash !== computedHash) {
        throw new Error("Canonical Content OS state hash does not match stored state.");
      }
    }
    stateHash = computedHash;
  } else if (
    row.revision !== 0 ||
    row.updated_at !== null ||
    stateHash !== null ||
    row.last_action !== "legacy" ||
    row.last_request_id !== null ||
    restoredFromRevision !== null
  ) {
    throw new Error("Only the initialized canonical Content OS row may have empty state.");
  }

  if (row.schema_version === STATE_SCHEMA_VERSION && state !== null) {
    if (row.updated_at !== state.updatedAt || !state.updatedAt) {
      throw new Error("Canonical Content OS update timestamps do not match.");
    }
    if (!isValidStateAction(row.last_action) || !isValidRequestId(row.last_request_id)) {
      throw new Error("Canonical Content OS audit metadata is invalid.");
    }
    if (!hasValidRestoreProvenance(row.last_action, restoredFromRevision, row.revision)) {
      throw new Error("Canonical Content OS restore provenance is invalid.");
    }
  } else if (state !== null && (
    row.last_action !== "legacy" ||
    row.last_request_id !== null ||
    restoredFromRevision !== null ||
    ![null, "legacy-unhashed"].includes(row.state_hash)
  )) {
    throw new Error("Legacy Content OS audit metadata is invalid.");
  }

  return {
    schemaVersion: state?.version || STATE_SCHEMA_VERSION,
    revision: row.revision,
    updatedAt: row.updated_at,
    stateHash,
    lastAction: row.last_action ?? "legacy",
    lastRequestId: row.last_request_id ?? null,
    restoredFromRevision,
    state,
  };
}

export async function readRecord(env) {
  const row = await env.APC_CONTENT_OS_DB
    .prepare(`SELECT schema_version, revision, updated_at, state_json,
      state_hash, last_action, last_request_id, restored_from_revision
      FROM content_os_state WHERE id = ?`)
    .bind(1)
    .first();
  const record = await recordFromRow(row);
  if (!record) throw new Error("Canonical Content OS row is not initialized.");
  return record;
}

export async function writeCanonicalState({
  env,
  state,
  expectedRevision,
  action,
  requestId,
  restoredFromRevision = null,
}) {
  if (!isValidRevision(expectedRevision)) throw new Error("Invalid canonical expected revision.");
  if (!isValidStateAction(action)) throw new Error("Invalid canonical action.");
  if (!isValidRequestId(requestId)) throw new Error("Invalid canonical request ID.");
  if (!hasValidRestoreProvenance(action, restoredFromRevision)) {
    throw new Error("Invalid canonical restore provenance.");
  }
  const updatedAt = new Date().toISOString();
  const canonicalState = structuredClone(state);
  canonicalState.updatedAt = updatedAt;
  assertValidContentOsState(canonicalState);

  const stateJson = JSON.stringify(canonicalState);
  const stateHash = await sha256Hex(stateJson);
  const result = await env.APC_CONTENT_OS_DB
    .prepare(`UPDATE content_os_state
      SET schema_version = ?, revision = revision + 1, updated_at = ?,
          state_json = ?, last_action = ?, last_request_id = ?, state_hash = ?,
          restored_from_revision = ?
      WHERE id = ? AND revision = ?
        AND NOT EXISTS (
          SELECT 1 FROM content_os_revisions WHERE request_id = ?
        )`)
    .bind(
      STATE_SCHEMA_VERSION,
      updatedAt,
      stateJson,
      action,
      requestId,
      stateHash,
      restoredFromRevision,
      1,
      expectedRevision,
      requestId,
    )
    .run();

  const changes = Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
  if (changes === 0) {
    const current = await readRecord(env);
    if (
      current.revision === expectedRevision + 1 &&
      current.lastRequestId === requestId &&
      current.lastAction === action &&
      current.restoredFromRevision === restoredFromRevision &&
      current.updatedAt
    ) {
      const replayState = structuredClone(state);
      replayState.updatedAt = current.updatedAt;
      assertValidContentOsState(replayState);
      const replayHash = await sha256Hex(JSON.stringify(replayState));
      if (replayHash === current.stateHash) {
        return { conflict: false, idempotent: true, record: current };
      }
    }
    return { conflict: true, idempotent: false, record: current };
  }

  return {
    conflict: false,
    idempotent: false,
    record: {
      schemaVersion: STATE_SCHEMA_VERSION,
      revision: expectedRevision + 1,
      updatedAt,
      stateHash,
      lastAction: action,
      lastRequestId: requestId,
      restoredFromRevision,
      state: canonicalState,
    },
  };
}

async function handleGet({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) {
    return json({ error: "Canonical database is not configured." }, 503);
  }
  if (request && new URL(request.url).search) {
    return json({ error: "State reads do not accept query parameters." }, 400);
  }
  try {
    return json(await readRecord(env));
  } catch (error) {
    console.error(JSON.stringify({
      message: "Content OS read failed",
      errorType: String(error?.name || "Error"),
    }));
    return json({ error: "Canonical state is unavailable." }, 503);
  }
}

async function handlePut({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) {
    return json({ error: "Canonical database is not configured." }, 503);
  }
  if (new URL(request.url).search) {
    return json({ error: "State writes do not accept query parameters." }, 400);
  }

  const writeFailure = validateWriteRequest(request);
  if (writeFailure) return writeFailure;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;

  if (!hasExactKeys(payload, STATE_PAYLOAD_KEYS)) {
    return json({ error: "Request must contain only expectedRevision, state, action, and requestId." }, 400);
  }
  if (!isValidRevision(payload.expectedRevision)) {
    return json({ error: "expectedRevision must be a non-negative safe integer." }, 400);
  }
  if (!isValidStateAction(payload.action)) {
    return json({ error: `action must be one of: ${ALLOWED_STATE_ACTIONS.join(", ")}.` }, 400);
  }
  if (payload.action === "restore") {
    return json({ error: "Restore must use the revision history endpoint." }, 400);
  }
  if (!isValidRequestId(payload.requestId)) {
    return json({ error: "requestId is invalid." }, 400);
  }

  try {
    assertValidContentOsState(payload.state);
  } catch {
    return json({ error: `State does not match APC Content OS schema ${STATE_SCHEMA_VERSION}.` }, 400);
  }

  try {
    const result = await writeCanonicalState({
      env,
      state: payload.state,
      expectedRevision: payload.expectedRevision,
      action: payload.action,
      requestId: payload.requestId,
    });
    return json(result.record, result.conflict ? 409 : 200);
  } catch (error) {
    console.error(JSON.stringify({
      message: "Content OS write failed",
      errorType: String(error?.name || "Error"),
    }));
    return json({ error: "Canonical state is unavailable." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return handleGet(context);
  if (context.request.method === "PUT") return handlePut(context);
  return methodNotAllowed(["GET", "PUT"]);
}

export async function onRequestGet(context) {
  return handleGet(context);
}

export async function onRequestPut(context) {
  return handlePut(context);
}
