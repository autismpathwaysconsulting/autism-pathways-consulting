const STATE_KEY = "apc-content-os:v2.1:state";
const SCHEMA_VERSION = "2.1";
const MAX_BODY_BYTES = 256 * 1024;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function emptyRecord() {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, updatedAt: null, state: null };
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

async function readRecord(env) {
  return (await env.APC_CONTENT_OS_STATE.get(STATE_KEY, "json")) || emptyRecord();
}

export async function onRequestGet({ env }) {
  return json(await readRecord(env));
}

export async function onRequestPut({ request, env }) {
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

  const current = await readRecord(env);
  if (payload.expectedRevision !== current.revision) return json(current, 409);

  const next = {
    schemaVersion: SCHEMA_VERSION,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    state: payload.state,
  };
  await env.APC_CONTENT_OS_STATE.put(STATE_KEY, JSON.stringify(next));
  return json(next);
}
