const SCHEMA_VERSION = "2.1";
const MAX_BODY_BYTES = 256 * 1024;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function validState(state) {
  return Boolean(
    state &&
    typeof state === "object" &&
    !Array.isArray(state) &&
    state.version === SCHEMA_VERSION &&
    state.calendar && typeof state.calendar === "object" && !Array.isArray(state.calendar) &&
    Array.isArray(state.results) &&
    state.products && typeof state.products === "object" && !Array.isArray(state.products) &&
    Array.isArray(state.book)
  );
}

function recordFromRow(row) {
  if (!row) return null;
  return {
    schemaVersion: row.schema_version,
    revision: row.revision,
    updatedAt: row.updated_at,
    state: row.state_json ? JSON.parse(row.state_json) : null,
  };
}

async function readRecord(env) {
  const row = await env.APC_CONTENT_OS_DB
    .prepare("SELECT schema_version, revision, updated_at, state_json FROM content_os_state WHERE id = ?")
    .bind(1)
    .first();
  const record = recordFromRow(row);
  if (!record) throw new Error("Canonical Content OS row is not initialized.");
  return record;
}

export async function onRequestGet({ env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  try {
    return json(await readRecord(env));
  } catch (error) {
    console.error(JSON.stringify({ message: "Content OS read failed", error: String(error?.message || error) }));
    return json({ error: "Canonical state is unavailable." }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Canonical database is not configured." }, 503);
  if (request.headers.get("X-APC-Content-OS") !== "1") {
    return json({ error: "Missing sync request header." }, 400);
  }

  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin writes are not allowed." }, 403);
  }

  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: "Request body is too large." }, 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large." }, 413);
  }

  let payload;
  try { payload = JSON.parse(raw); } catch {
    return json({ error: "Request body is not valid JSON." }, 400);
  }

  if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) {
    return json({ error: "expectedRevision must be a non-negative integer." }, 400);
  }
  if (!validState(payload.state)) return json({ error: "State does not match APC Content OS schema 2.1." }, 400);

  const updatedAt = new Date().toISOString();
  try {
    const result = await env.APC_CONTENT_OS_DB
      .prepare(`UPDATE content_os_state
        SET schema_version = ?, revision = revision + 1, updated_at = ?, state_json = ?
        WHERE id = ? AND revision = ?`)
      .bind(SCHEMA_VERSION, updatedAt, JSON.stringify(payload.state), 1, payload.expectedRevision)
      .run();

    if (result.meta.changes === 0) return json(await readRecord(env), 409);

    return json({
      schemaVersion: SCHEMA_VERSION,
      revision: payload.expectedRevision + 1,
      updatedAt,
      state: payload.state,
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Content OS write failed", error: String(error?.message || error) }));
    return json({ error: "Canonical state is unavailable." }, 503);
  }
}
