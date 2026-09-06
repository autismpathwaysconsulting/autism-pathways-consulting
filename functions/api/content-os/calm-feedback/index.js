const MAX_BODY_BYTES = 16 * 1024;
const TRIAGE_STATUSES = new Set(["NEW", "REVIEWED", "ACTION_NEEDED", "IMPLEMENTED", "ARCHIVED"]);

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required) {
  return isObject(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key));
}

function validText(value, maximum, required = true) {
  return typeof value === "string" && value.length <= maximum && (!required || Boolean(value.trim())) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

export function validateCalmFeedbackAction(payload) {
  if (!exactKeys(payload, ["action", "feedbackId", "status", "decisionNote", "expectedRevision"])) return "Feedback update does not match the expected schema.";
  if (payload.action !== "set_triage") return "Feedback action is not supported.";
  if (!validText(payload.feedbackId, 80) || !/^[A-Za-z0-9-]{8,80}$/.test(payload.feedbackId)) return "Feedback reference is invalid.";
  if (!TRIAGE_STATUSES.has(payload.status)) return "Feedback status is invalid.";
  if (!validText(payload.decisionNote, 2000, false)) return "Decision note is invalid.";
  if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) return "Expected revision is invalid.";
  return null;
}

function isRevisionConflict(error) {
  return /calm feedback triage revision conflict|UNIQUE constraint failed: calm_feedback_triage_events/i.test(String(error?.message || error));
}

async function readBody(request) {
  if (request.headers.get("X-APC-Content-OS") !== "1") return { error: json({ error: "Missing Content OS request header." }, 400) };
  if (new URL(request.url).search) return { error: json({ error: "POST does not accept query parameters." }, 400) };
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return { error: json({ error: "Cross-origin writes are not allowed." }, 403) };
  if ((request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") return { error: json({ error: "Content-Type must be application/json." }, 415) };
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return { error: json({ error: "Content-Length is invalid or too large." }, Number(declared) > MAX_BODY_BYTES ? 413 : 400) };
  const reader = request.body?.getReader();
  if (!reader) return { error: json({ error: "Request body is required." }, 400) };
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: json({ error: "Request body is too large." }, 413) };
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
  try {
    return { payload: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { error: json({ error: "Request body is not valid UTF-8 JSON." }, 400) };
  }
}

async function overview(contentDatabase, feedbackDatabase) {
  const [feedback, triage, events] = await Promise.all([
    feedbackDatabase.prepare(`SELECT id, helpfulness, category, comment, app_version, created_at
      FROM feedback ORDER BY datetime(created_at) DESC LIMIT 200`).all(),
    contentDatabase.prepare("SELECT feedback_id, status, decision_note, revision, updated_at FROM calm_feedback_triage").all(),
    contentDatabase.prepare("SELECT event_id, feedback_id, status, decision_note, revision, actor, created_at FROM calm_feedback_triage_events ORDER BY created_at DESC LIMIT 500").all(),
  ]);
  const triageById = new Map((triage.results || []).map((row) => [row.feedback_id, row]));
  const items = (feedback.results || []).map((row) => {
    const state = triageById.get(row.id);
    return {
      id: row.id,
      helpfulness: row.helpfulness,
      category: row.category,
      comment: row.comment,
      appVersion: row.app_version,
      createdAt: row.created_at,
      status: state?.status || "NEW",
      decisionNote: state?.decision_note || "",
      revision: Number(state?.revision || 0),
      updatedAt: state?.updated_at || null,
    };
  });
  const counts = Object.fromEntries([...TRIAGE_STATUSES].map((status) => [status, items.filter((item) => item.status === status).length]));
  return { schemaVersion: "apc.calm_feedback_inbox.v1", counts, items, events: events.results || [] };
}

export async function onRequestGet({ env }) {
  if (!env.APC_CONTENT_OS_DB || !env.APC_CALM_FEEDBACK_DB) return json({ error: "Calm feedback inbox storage is not configured." }, 503);
  try {
    return json(await overview(env.APC_CONTENT_OS_DB, env.APC_CALM_FEEDBACK_DB));
  } catch (error) {
    console.error(JSON.stringify({ message: "Calm feedback inbox read failed", errorType: String(error?.name || "Error") }));
    return json({ error: "Calm feedback inbox is unavailable." }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.APC_CONTENT_OS_DB || !env.APC_CALM_FEEDBACK_DB) return json({ error: "Calm feedback inbox storage is not configured." }, 503);
  const body = await readBody(request);
  if (body.error) return body.error;
  const validation = validateCalmFeedbackAction(body.payload);
  if (validation) return json({ error: validation }, 400);
  const payload = body.payload;
  try {
    const source = await env.APC_CALM_FEEDBACK_DB.prepare("SELECT id FROM feedback WHERE id = ?").bind(payload.feedbackId).first();
    if (!source) return json({ error: "Feedback item was not found." }, 404);
    const current = await env.APC_CONTENT_OS_DB.prepare("SELECT revision FROM calm_feedback_triage WHERE feedback_id = ?").bind(payload.feedbackId).first();
    const currentRevision = Number(current?.revision || 0);
    if (currentRevision !== payload.expectedRevision) return json({ error: "Feedback changed on another screen. Refresh before saving." }, 409);
    const nextRevision = currentRevision + 1;
    const now = new Date().toISOString();
    await env.APC_CONTENT_OS_DB.batch([
      env.APC_CONTENT_OS_DB.prepare(`INSERT INTO calm_feedback_triage
        (feedback_id, status, decision_note, revision, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(feedback_id) DO UPDATE SET status = excluded.status, decision_note = excluded.decision_note,
        revision = excluded.revision, updated_at = excluded.updated_at
        WHERE calm_feedback_triage.revision = ?`).bind(payload.feedbackId, payload.status, payload.decisionNote.trim(), nextRevision, now, currentRevision),
      env.APC_CONTENT_OS_DB.prepare(`INSERT INTO calm_feedback_triage_events
        (event_id, feedback_id, status, decision_note, revision, actor, created_at) VALUES (?, ?, ?, ?, ?, 'CJ', ?)`).bind(crypto.randomUUID(), payload.feedbackId, payload.status, payload.decisionNote.trim(), nextRevision, now),
    ]);
    return json(await overview(env.APC_CONTENT_OS_DB, env.APC_CALM_FEEDBACK_DB));
  } catch (error) {
    if (isRevisionConflict(error)) return json({ error: "Feedback changed on another screen. Refresh before saving." }, 409);
    console.error(JSON.stringify({ message: "Calm feedback triage write failed", errorType: String(error?.name || "Error") }));
    return json({ error: "The feedback decision could not be saved." }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "Only GET and POST are supported." }, 405, { Allow: "GET, POST" });
}
