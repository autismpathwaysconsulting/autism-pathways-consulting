const MAX_BODY_BYTES = 128 * 1024;
const CLIENT_STAGES = new Set([
  "RECORD_REVIEW_REQUIRED", "FIT_REVIEW", "APPROVED_TO_PAY", "PAYMENT_PROOF_RECEIVED",
  "PAYMENT_VERIFIED", "BOOKED", "PREPARATION", "SESSION_READY", "IN_SESSION",
  "DOCUMENTATION_DRAFT", "CJ_APPROVED", "DELIVERED", "COMPLETE", "REFERRED", "CANCELLED", "PAUSED",
]);
const SERVICES = new Set(["TBD", "RM350", "RM1800", "CUSTOM"]);
const SOURCE_STATUSES = new Set(["UNVERIFIED", "PARENT_REPORTED", "CJ_VERIFIED"]);
const SESSION_STATUSES = new Set(["PLANNED", "READY", "IN_SESSION", "DOCUMENTATION_DRAFT", "CJ_APPROVED", "DELIVERED", "COMPLETE", "CANCELLED"]);
const DOCUMENT_STATUSES = new Set(["DRAFT", "CJ_APPROVED", "EXPORTED", "DELIVERED", "SUPERSEDED"]);
const OPERATOR_EDITABLE_DOCUMENT_STATUSES = new Set(["DRAFT", "CJ_APPROVED", "SUPERSEDED"]);

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

function validOptionalDate(value) {
  return value === null || (typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}(?:T[0-9:.+-Z]+)?$/.test(value));
}

function validList(value, maximumItems = 80) {
  return Array.isArray(value) && value.length <= maximumItems && value.every((item) => validText(item, 2000, false));
}

function validCaseId(value) {
  return typeof value === "string" && /^CASE-\d{4}-[A-Z0-9]{6}$/.test(value);
}

function validSessionId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function validateClient(client) {
  const keys = ["displayName", "childAge", "region", "concern", "stage", "serviceCode", "nextAction", "sourceStatus", "knownFacts", "openQuestions", "boundaryFlags"];
  if (!exactKeys(client, keys)) return "Client record does not match the expected schema.";
  if (!validText(client.displayName, 200) || !validText(client.region, 200) || !validText(client.concern, 4000) || !validText(client.nextAction, 4000)) return "Required client information is invalid.";
  if (client.childAge !== null && (!Number.isSafeInteger(client.childAge) || client.childAge < 0 || client.childAge > 25)) return "Child age is invalid.";
  if (!CLIENT_STAGES.has(client.stage) || !SERVICES.has(client.serviceCode) || !SOURCE_STATUSES.has(client.sourceStatus)) return "Client status is invalid.";
  if (!validList(client.knownFacts) || !validList(client.openQuestions) || !validList(client.boundaryFlags)) return "Client notes are invalid.";
  return null;
}

function validateSession(session) {
  const keys = ["status", "scheduledAt", "occurredAt", "preparation", "privateNotes", "parentSummary", "actionPlan", "documentStatus"];
  if (!exactKeys(session, keys)) return "Session record does not match the expected schema.";
  if (!SESSION_STATUSES.has(session.status) || !DOCUMENT_STATUSES.has(session.documentStatus)) return "Session status is invalid.";
  if (!OPERATOR_EDITABLE_DOCUMENT_STATUSES.has(session.documentStatus)) return "Export and delivery states must come from the recorded export workflow.";
  if (!validOptionalDate(session.scheduledAt) || !validOptionalDate(session.occurredAt)) return "Session date is invalid.";
  if (!validText(session.preparation, 10000, false) || !validText(session.privateNotes, 30000, false) || !validText(session.parentSummary, 20000, false) || !validText(session.actionPlan, 20000, false)) return "Session notes are invalid.";
  if (["CJ_APPROVED", "EXPORTED", "DELIVERED"].includes(session.documentStatus) && (!session.parentSummary.trim() || !session.actionPlan.trim())) return "CJ approval requires both a parent summary and an action plan.";
  return null;
}

export function validatePracticeAction(payload) {
  if (!isObject(payload) || typeof payload.action !== "string") return "Request must be a practice workflow action.";
  if (payload.action === "create_client") {
    if (!exactKeys(payload, ["action", "client", "reason"]) || !validText(payload.reason, 500)) return "New client request is invalid.";
    return validateClient(payload.client);
  }
  if (payload.action === "update_client") {
    if (!exactKeys(payload, ["action", "caseId", "expectedRevision", "client", "reason"]) || !validCaseId(payload.caseId) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1 || !validText(payload.reason, 500)) return "Client update request is invalid.";
    return validateClient(payload.client);
  }
  if (payload.action === "create_session") {
    if (!exactKeys(payload, ["action", "caseId", "scheduledAt"]) || !validCaseId(payload.caseId) || !validOptionalDate(payload.scheduledAt)) return "New session request is invalid.";
    return null;
  }
  if (payload.action === "save_session") {
    if (!exactKeys(payload, ["action", "sessionId", "expectedRevision", "session"]) || !validSessionId(payload.sessionId) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1) return "Session update request is invalid.";
    return validateSession(payload.session);
  }
  if (payload.action === "prepare_export") {
    if (!exactKeys(payload, ["action", "sessionId", "destination"]) || !validSessionId(payload.sessionId) || !["LOCAL", "GOOGLE_DRIVE"].includes(payload.destination)) return "Export request is invalid.";
    return null;
  }
  if (payload.action === "confirm_drive_export") {
    if (!exactKeys(payload, ["action", "exportId", "providerFileId"]) || !validSessionId(payload.exportId) || !validText(payload.providerFileId, 240)) return "Drive confirmation is invalid.";
    return null;
  }
  return "Practice action is not supported.";
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

function parseList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clientFromRow(row) {
  return {
    caseId: row.case_id,
    displayName: row.display_name,
    childAge: row.child_age === null ? null : Number(row.child_age),
    region: row.region,
    concern: row.concern,
    stage: row.stage,
    serviceCode: row.service_code,
    nextAction: row.next_action,
    sourceStatus: row.source_status,
    knownFacts: parseList(row.known_facts_json),
    openQuestions: parseList(row.open_questions_json),
    boundaryFlags: parseList(row.boundary_flags_json),
    revision: Number(row.revision),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sessionFromRow(row) {
  return {
    sessionId: row.session_id,
    caseId: row.case_id,
    sessionNumber: Number(row.session_number),
    status: row.status,
    scheduledAt: row.scheduled_at,
    occurredAt: row.occurred_at,
    preparation: row.preparation,
    privateNotes: row.private_notes,
    parentSummary: row.parent_summary,
    actionPlan: row.action_plan,
    documentStatus: row.document_status,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function overview(database, actionResult = null) {
  const [clients, sessions, exports, clientHistory, sessionHistory] = await database.batch([
    database.prepare("SELECT * FROM practice_clients ORDER BY archived_at IS NOT NULL, updated_at DESC"),
    database.prepare("SELECT * FROM practice_sessions ORDER BY updated_at DESC"),
    database.prepare("SELECT * FROM practice_exports ORDER BY created_at DESC LIMIT 500"),
    database.prepare("SELECT revision_id, case_id, revision, event_type, actor, reason, created_at FROM practice_client_revisions ORDER BY created_at DESC LIMIT 500"),
    database.prepare("SELECT revision_id, session_id, case_id, revision, event_type, actor, created_at FROM practice_session_revisions ORDER BY created_at DESC LIMIT 500"),
  ]);
  return {
    schemaVersion: "apc.practice_console.v1",
    actionResult,
    clients: (clients.results || []).map(clientFromRow),
    sessions: (sessions.results || []).map(sessionFromRow),
    exports: (exports.results || []).map((row) => ({
      exportId: row.export_id,
      caseId: row.case_id,
      sessionId: row.session_id,
      documentType: row.document_type,
      documentVersion: Number(row.document_version),
      destination: row.destination,
      filename: row.filename,
      contentSha256: row.content_sha256,
      byteSize: Number(row.byte_size),
      providerFileId: row.provider_file_id,
      status: row.status,
      createdAt: row.created_at,
    })),
    activity: [
      ...(clientHistory.results || []).map((row) => ({
        id: row.revision_id, recordType: "CLIENT", caseId: row.case_id, sessionId: null,
        revision: Number(row.revision), eventType: row.event_type, actor: row.actor,
        reason: row.reason, createdAt: row.created_at,
      })),
      ...(sessionHistory.results || []).map((row) => ({
        id: row.revision_id, recordType: "SESSION", caseId: row.case_id, sessionId: row.session_id,
        revision: Number(row.revision), eventType: row.event_type, actor: row.actor,
        reason: "Session workspace revision", createdAt: row.created_at,
      })),
    ].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, 500),
  };
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function caseId() {
  return `CASE-${new Date().getUTCFullYear()}-${randomCode()}`;
}

function clientSnapshot(identifier, client, revision, now) {
  return { schemaVersion: "apc.practice_client_snapshot.v1", caseId: identifier, ...client, revision, updatedAt: now };
}

function sessionSnapshot(identifier, caseIdentifier, number, session, revision, now) {
  return { schemaVersion: "apc.practice_session_snapshot.v1", sessionId: identifier, caseId: caseIdentifier, sessionNumber: number, ...session, revision, updatedAt: now };
}

function clientValues(client) {
  return [client.displayName.trim(), client.childAge, client.region.trim(), client.concern.trim(), client.stage, client.serviceCode, client.nextAction.trim(), client.sourceStatus, JSON.stringify(client.knownFacts), JSON.stringify(client.openQuestions), JSON.stringify(client.boundaryFlags)];
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeFilename(caseIdentifier, serviceCode, sessionNumber, documentVersion, date) {
  const service = serviceCode === "RM1800" ? "RM1800" : serviceCode === "RM350" ? "RM350" : "APC";
  return `APC_${caseIdentifier}_${service}_S${String(sessionNumber).padStart(2, "0")}_Follow-Through-Pack_v${String(documentVersion).padStart(2, "0")}_${date}.md`;
}

function followThroughMarkdown(client, session) {
  return `---\ndocument_type: session_follow_through_pack\ncase_id: ${client.case_id}\noffer: ${client.service_code}\nsession: ${session.session_number}\ncase_revision: ${client.revision}\ndocument_version: ${session.revision}\nstatus: ${session.document_status}\ncreated_at: ${session.updated_at}\n---\n\n# Session ${session.session_number} follow-through pack\n\nPrepared for the family.\n\n## Meeting summary\n\n${session.parent_summary.trim()}\n\n## Action plan\n\n${session.action_plan.trim()}\n\n## Scope note\n\nThis is an educational working summary from the examples discussed. It is not a diagnosis, assessment, therapy plan, medical recommendation or crisis service.\n`;
}

export async function onRequestGet({ env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Practice Console storage is not configured." }, 503);
  try {
    const result = await overview(env.APC_CONTENT_OS_DB);
    result.writesEnabled = env.APC_PRACTICE_LIVE_WRITES_ENABLED === "true";
    return json(result);
  } catch (error) {
    console.error(JSON.stringify({ message: "Practice Console read failed", errorType: String(error?.name || "Error") }));
    return json({ error: "Practice Console is unavailable." }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.APC_CONTENT_OS_DB) return json({ error: "Practice Console storage is not configured." }, 503);
  if (env.APC_PRACTICE_LIVE_WRITES_ENABLED !== "true") return json({ error: "Live client writes remain disabled while the privacy approval hold is open." }, 503);
  const body = await readBody(request);
  if (body.error) return body.error;
  const validation = validatePracticeAction(body.payload);
  if (validation) return json({ error: validation }, 400);
  const payload = body.payload;
  const database = env.APC_CONTENT_OS_DB;
  const now = new Date().toISOString();
  try {
    if (payload.action === "create_client") {
      let identifier = caseId();
      while (await database.prepare("SELECT case_id FROM practice_clients WHERE case_id = ?").bind(identifier).first()) identifier = caseId();
      const values = clientValues(payload.client);
      const snapshot = clientSnapshot(identifier, payload.client, 1, now);
      await database.batch([
        database.prepare(`INSERT INTO practice_clients
          (case_id, display_name, child_age, region, concern, stage, service_code, next_action, source_status,
           known_facts_json, open_questions_json, boundary_flags_json, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(identifier, ...values, now, now),
        database.prepare(`INSERT INTO practice_client_revisions
          (revision_id, case_id, revision, event_type, actor, reason, snapshot_json, created_at)
          VALUES (?, ?, 1, 'CREATED', 'CJ', ?, ?, ?)`).bind(crypto.randomUUID(), identifier, payload.reason.trim(), JSON.stringify(snapshot), now),
      ]);
      return json(await overview(database, { action: payload.action, caseId: identifier }), 201);
    }

    if (payload.action === "update_client") {
      const current = await database.prepare("SELECT * FROM practice_clients WHERE case_id = ?").bind(payload.caseId).first();
      if (!current) return json({ error: "Client record was not found." }, 404);
      if (Number(current.revision) !== payload.expectedRevision) return json({ error: "Client record changed on another screen. Refresh before saving." }, 409);
      const nextRevision = payload.expectedRevision + 1;
      const values = clientValues(payload.client);
      const snapshot = clientSnapshot(payload.caseId, payload.client, nextRevision, now);
      await database.batch([
        database.prepare(`UPDATE practice_clients SET display_name = ?, child_age = ?, region = ?, concern = ?, stage = ?,
          service_code = ?, next_action = ?, source_status = ?, known_facts_json = ?, open_questions_json = ?, boundary_flags_json = ?,
          revision = ?, updated_at = ? WHERE case_id = ? AND revision = ?`).bind(...values, nextRevision, now, payload.caseId, payload.expectedRevision),
        database.prepare(`INSERT INTO practice_client_revisions
          (revision_id, case_id, revision, event_type, actor, reason, snapshot_json, created_at)
          VALUES (?, ?, ?, 'UPDATED', 'CJ', ?, ?, ?)`).bind(crypto.randomUUID(), payload.caseId, nextRevision, payload.reason.trim(), JSON.stringify(snapshot), now),
      ]);
      return json(await overview(database, { action: payload.action, caseId: payload.caseId }));
    }

    if (payload.action === "create_session") {
      const client = await database.prepare("SELECT case_id FROM practice_clients WHERE case_id = ? AND archived_at IS NULL").bind(payload.caseId).first();
      if (!client) return json({ error: "Active client record was not found." }, 404);
      const latest = await database.prepare("SELECT COALESCE(MAX(session_number), 0) AS number FROM practice_sessions WHERE case_id = ?").bind(payload.caseId).first();
      const number = Number(latest?.number || 0) + 1;
      if (number > 12) return json({ error: "This record already has the maximum supported session count." }, 409);
      const sessionId = crypto.randomUUID();
      const session = { status: "PLANNED", scheduledAt: payload.scheduledAt, occurredAt: null, preparation: "", privateNotes: "", parentSummary: "", actionPlan: "", documentStatus: "DRAFT" };
      const snapshot = sessionSnapshot(sessionId, payload.caseId, number, session, 1, now);
      await database.batch([
        database.prepare(`INSERT INTO practice_sessions
          (session_id, case_id, session_number, status, scheduled_at, occurred_at, preparation, private_notes,
           parent_summary, action_plan, document_status, revision, created_at, updated_at)
          VALUES (?, ?, ?, 'PLANNED', ?, NULL, '', '', '', '', 'DRAFT', 1, ?, ?)`).bind(sessionId, payload.caseId, number, payload.scheduledAt, now, now),
        database.prepare(`INSERT INTO practice_session_revisions
          (revision_id, session_id, case_id, revision, event_type, actor, snapshot_json, created_at)
          VALUES (?, ?, ?, 1, 'CREATED', 'CJ', ?, ?)`).bind(crypto.randomUUID(), sessionId, payload.caseId, JSON.stringify(snapshot), now),
      ]);
      return json(await overview(database, { action: payload.action, caseId: payload.caseId, sessionId }), 201);
    }

    if (payload.action === "save_session") {
      const current = await database.prepare("SELECT * FROM practice_sessions WHERE session_id = ?").bind(payload.sessionId).first();
      if (!current) return json({ error: "Session record was not found." }, 404);
      if (Number(current.revision) !== payload.expectedRevision) return json({ error: "Session changed on another screen. Refresh before saving." }, 409);
      const nextRevision = payload.expectedRevision + 1;
      const eventType = payload.session.documentStatus === "CJ_APPROVED" && current.document_status !== "CJ_APPROVED" ? "APPROVED" : payload.session.documentStatus === "DELIVERED" ? "DELIVERED" : "UPDATED";
      const snapshot = sessionSnapshot(payload.sessionId, current.case_id, Number(current.session_number), payload.session, nextRevision, now);
      await database.batch([
        database.prepare(`UPDATE practice_sessions SET status = ?, scheduled_at = ?, occurred_at = ?, preparation = ?,
          private_notes = ?, parent_summary = ?, action_plan = ?, document_status = ?, revision = ?, updated_at = ?
          WHERE session_id = ? AND revision = ?`).bind(payload.session.status, payload.session.scheduledAt, payload.session.occurredAt,
          payload.session.preparation, payload.session.privateNotes, payload.session.parentSummary, payload.session.actionPlan,
          payload.session.documentStatus, nextRevision, now, payload.sessionId, payload.expectedRevision),
        database.prepare(`INSERT INTO practice_session_revisions
          (revision_id, session_id, case_id, revision, event_type, actor, snapshot_json, created_at)
          VALUES (?, ?, ?, ?, ?, 'CJ', ?, ?)`).bind(crypto.randomUUID(), payload.sessionId, current.case_id, nextRevision, eventType, JSON.stringify(snapshot), now),
      ]);
      return json(await overview(database, { action: payload.action, caseId: current.case_id, sessionId: payload.sessionId }));
    }

    if (payload.action === "prepare_export") {
      const session = await database.prepare("SELECT * FROM practice_sessions WHERE session_id = ?").bind(payload.sessionId).first();
      if (!session) return json({ error: "Session record was not found." }, 404);
      if (!["CJ_APPROVED", "EXPORTED", "DELIVERED"].includes(session.document_status)) return json({ error: "CJ must approve the summary and action plan before export." }, 409);
      const client = await database.prepare("SELECT * FROM practice_clients WHERE case_id = ?").bind(session.case_id).first();
      const content = followThroughMarkdown(client, session);
      const contentSha256 = await sha256Hex(content);
      const destination = payload.destination;
      const documentVersion = Number(session.revision);
      const existing = await database.prepare(`SELECT * FROM practice_exports WHERE session_id = ? AND document_type = 'FOLLOW_THROUGH_PACK'
        AND document_version = ? AND destination = ?`).bind(payload.sessionId, documentVersion, destination).first();
      if (existing && existing.content_sha256 !== contentSha256) return json({ error: "This approved document version no longer matches its recorded hash. Save a new session revision before exporting again." }, 409);
      const exportId = existing?.export_id || crypto.randomUUID();
      const filename = safeFilename(client.case_id, client.service_code, Number(session.session_number), documentVersion, now.slice(0, 10));
      if (!existing) {
        await database.prepare(`INSERT INTO practice_exports
          (export_id, case_id, session_id, document_type, document_version, destination, filename, content_sha256,
           byte_size, provider_file_id, status, created_at) VALUES (?, ?, ?, 'FOLLOW_THROUGH_PACK', ?, ?, ?, ?, ?, NULL, ?, ?)`)
          .bind(exportId, client.case_id, payload.sessionId, documentVersion, destination, filename, contentSha256, new TextEncoder().encode(content).byteLength, destination === "LOCAL" ? "SAVED" : "QUEUED", now).run();
      }
      return json({ ...(await overview(database, { action: payload.action, caseId: client.case_id, sessionId: payload.sessionId, exportId })), download: { exportId, filename, content, contentSha256, destination, status: existing?.status || (destination === "LOCAL" ? "SAVED" : "QUEUED") } });
    }

    if (payload.action === "confirm_drive_export") {
      const result = await database.prepare(`UPDATE practice_exports SET provider_file_id = ?, status = 'SAVED'
        WHERE export_id = ? AND destination = 'GOOGLE_DRIVE' AND status = 'QUEUED'`).bind(payload.providerFileId.trim(), payload.exportId).run();
      if (Number(result.meta?.changes || 0) !== 1) return json({ error: "Queued Drive export was not found." }, 404);
      return json(await overview(database, { action: payload.action, exportId: payload.exportId }));
    }
  } catch (error) {
    console.error(JSON.stringify({ message: "Practice Console write failed", action: payload.action, errorType: String(error?.name || "Error") }));
    return json({ error: "The Practice Console update could not be saved." }, 503);
  }
  return json({ error: "Practice action is not supported." }, 400);
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "Only GET and POST are supported." }, 405, { Allow: "GET, POST" });
}
