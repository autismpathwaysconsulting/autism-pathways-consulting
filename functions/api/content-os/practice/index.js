const MAX_BODY_BYTES = 128 * 1024;
const CLIENT_STAGES = new Set([
  "RECORD_REVIEW_REQUIRED", "FIT_REVIEW", "APPROVED_TO_PAY", "PAYMENT_PROOF_RECEIVED",
  "PAYMENT_VERIFIED", "BOOKED", "PREPARATION", "SESSION_READY", "IN_SESSION",
  "DOCUMENTATION_DRAFT", "CJ_APPROVED", "DELIVERED", "COMPLETE", "REFERRED", "CANCELLED", "PAUSED",
]);
const SERVICES = new Set(["TBD", "RM350", "RM1800"]);
const SOURCE_STATUSES = new Set(["UNVERIFIED", "PARENT_REPORTED", "CJ_VERIFIED"]);
const SESSION_STATUSES = new Set(["PLANNED", "READY", "IN_SESSION", "DOCUMENTATION_DRAFT", "CJ_APPROVED", "DELIVERED", "COMPLETE", "CANCELLED"]);
const DOCUMENT_STATUSES = new Set(["DRAFT", "CJ_APPROVED", "EXPORTED", "DELIVERED", "SUPERSEDED"]);
const OPERATOR_EDITABLE_DOCUMENT_STATUSES = new Set(["DRAFT", "CJ_APPROVED", "SUPERSEDED"]);
const RM350_JOURNEY = Object.freeze([
  { code: "PRE_SESSION_1", order: 1, label: "Pre-session" },
  { code: "SESSION_1", order: 2, label: "Session 1" },
  { code: "POST_SESSION_1", order: 3, label: "Post-session" },
]);
const RM1800_JOURNEY = Object.freeze([
  { code: "PRE_SESSION_1", order: 1, label: "Pre-session 1" },
  { code: "SESSION_1", order: 2, label: "Session 1" },
  { code: "SESSION_2", order: 3, label: "Session 2" },
  { code: "SESSION_3", order: 4, label: "Session 3" },
  { code: "SESSION_4", order: 5, label: "Session 4" },
  { code: "POST_SESSION_4", order: 6, label: "Post-session 4" },
]);
export const JOURNEY_TEMPLATES = Object.freeze({ RM350: RM350_JOURNEY, RM1800: RM1800_JOURNEY });
export const JOURNEY_STAGES = Object.freeze([
  ...RM1800_JOURNEY,
  RM350_JOURNEY[2],
]);
const JOURNEY_STAGE_CODES = new Set(JOURNEY_STAGES.map((stage) => stage.code));

function journeyStagesForService(serviceCode) {
  return JOURNEY_TEMPLATES[serviceCode] || [];
}

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
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validList(value, maximumItems = 80) {
  return Array.isArray(value) && value.length <= maximumItems && value.every((item) => validText(item, 2000, false));
}

function validCaseId(value) {
  return typeof value === "string" && /^CASE-\d{4}-[A-Z0-9]{6}$/.test(value);
}

function validSessionId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  const keys = ["journeyStage", "status", "scheduledAt", "occurredAt", "preparation", "templateAnswers", "privateNotes", "parentSummary", "actionPlan", "parentMaterials", "documentStatus"];
  if (!exactKeys(session, keys)) return "Session record does not match the expected schema.";
  if (!JOURNEY_STAGE_CODES.has(session.journeyStage)) return "Client journey stage is invalid.";
  if (!SESSION_STATUSES.has(session.status) || !DOCUMENT_STATUSES.has(session.documentStatus)) return "Session status is invalid.";
  if (!OPERATOR_EDITABLE_DOCUMENT_STATUSES.has(session.documentStatus)) return "Export and delivery states must come from the recorded export workflow.";
  if (!validOptionalDate(session.scheduledAt) || !validOptionalDate(session.occurredAt)) return "Session date is invalid.";
  if (!validText(session.preparation, 10000, false) || !validText(session.templateAnswers, 30000, false) || !validText(session.privateNotes, 30000, false) || !validText(session.parentSummary, 20000, false) || !validText(session.actionPlan, 20000, false) || !validText(session.parentMaterials, 10000, false)) return "Session notes are invalid.";
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
    if (!exactKeys(payload, ["action", "caseId", "scheduledAt"]) || !validCaseId(payload.caseId)) return "New session request is invalid.";
    if (!validOptionalDate(payload.scheduledAt)) return "Session date is invalid.";
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
    if (!exactKeys(payload, ["action", "exportId", "providerFileId"]) || !validSessionId(payload.exportId) || !validText(payload.providerFileId, 240) || !/^[A-Za-z0-9_-]{10,240}$/.test(payload.providerFileId)) return "Drive confirmation is invalid.";
    return null;
  }
  if (payload.action === "mark_delivered") {
    if (!exactKeys(payload, ["action", "sessionId", "expectedRevision"]) || !validSessionId(payload.sessionId) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1) return "Delivery confirmation is invalid.";
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
    journeyStage: row.journey_stage,
    status: row.status,
    scheduledAt: row.scheduled_at,
    occurredAt: row.occurred_at,
    preparation: row.preparation,
    templateAnswers: row.template_answers,
    privateNotes: row.private_notes,
    parentSummary: row.parent_summary,
    actionPlan: row.action_plan,
    parentMaterials: row.parent_materials,
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
    database.prepare(`SELECT history.revision_id, history.session_id, history.case_id, history.revision,
      history.event_type, history.actor, history.created_at, sessions.journey_stage
      FROM practice_session_revisions AS history
      LEFT JOIN practice_sessions AS sessions ON sessions.session_id = history.session_id
      ORDER BY history.created_at DESC LIMIT 500`),
  ]);
  return {
    schemaVersion: "apc.practice_console.v2",
    actionResult,
    journeyStages: JOURNEY_STAGES,
    journeyTemplates: JOURNEY_TEMPLATES,
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
        journeyStage: row.journey_stage, revision: Number(row.revision), eventType: row.event_type, actor: row.actor,
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

function editableSessionFromRow(row, overrides = {}) {
  return {
    journeyStage: row.journey_stage,
    status: row.status,
    scheduledAt: row.scheduled_at,
    occurredAt: row.occurred_at,
    preparation: row.preparation,
    templateAnswers: row.template_answers,
    privateNotes: row.private_notes,
    parentSummary: row.parent_summary,
    actionPlan: row.action_plan,
    parentMaterials: row.parent_materials,
    documentStatus: row.document_status,
    ...overrides,
  };
}

function isRevisionConflict(error) {
  return /revision conflict|UNIQUE constraint failed: practice_(?:client|session)_revisions/i.test(String(error?.message || error));
}

function clientValues(client) {
  return [client.displayName.trim(), client.childAge, client.region.trim(), client.concern.trim(), client.stage, client.serviceCode, client.nextAction.trim(), client.sourceStatus, JSON.stringify(client.knownFacts), JSON.stringify(client.openQuestions), JSON.stringify(client.boundaryFlags)];
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeFilename(caseIdentifier, serviceCode, journeyStage, documentVersion, date) {
  const service = serviceCode === "RM1800" ? "RM1800" : serviceCode === "RM350" ? "RM350" : "APC";
  return `APC_${caseIdentifier}_${service}_${journeyStage}_Follow-Through-Pack_v${String(documentVersion).padStart(2, "0")}_${date}.md`;
}

export function followThroughMarkdown(client, session) {
  const stage = JOURNEY_STAGES.find((item) => item.code === session.journey_stage);
  const materials = session.parent_materials.trim() || "No additional materials were assigned for this stage.";
  return `---\ndocument_type: session_follow_through_pack\ncase_id: ${client.case_id}\noffer: ${client.service_code}\njourney_stage: ${session.journey_stage}\njourney_order: ${session.session_number}\ncase_revision: ${client.revision}\ndocument_version: ${session.revision}\nstatus: ${session.document_status}\ncreated_at: ${session.updated_at}\n---\n\n# ${stage?.label || session.journey_stage} follow-through pack\n\nPrepared for the family.\n\n## Discussion summary\n\n${session.parent_summary.trim()}\n\n## Action plan\n\n${session.action_plan.trim()}\n\n## Materials and resources\n\n${materials}\n\n## Scope note\n\nThis is an educational working summary from the examples discussed. It is not a diagnosis, assessment, therapy plan, medical recommendation or crisis service.\n`;
}

function blankJourneySession(stage, scheduledAt = null) {
  return {
    journeyStage: stage.code,
    status: "PLANNED",
    scheduledAt,
    occurredAt: null,
    preparation: "",
    templateAnswers: "",
    privateNotes: "",
    parentSummary: "",
    actionPlan: "",
    parentMaterials: "",
    documentStatus: "DRAFT",
  };
}

function newJourneyStageStatements(database, caseIdentifier, stage, now, scheduledAt = null) {
  const sessionId = crypto.randomUUID();
  const session = blankJourneySession(stage, scheduledAt);
  const snapshot = sessionSnapshot(sessionId, caseIdentifier, stage.order, session, 1, now);
  return {
    sessionId,
    statements: [
      database.prepare(`INSERT INTO practice_sessions
        (session_id, case_id, session_number, journey_stage, status, scheduled_at, occurred_at, preparation,
         template_answers, private_notes, parent_summary, action_plan, parent_materials, document_status,
         revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'PLANNED', ?, NULL, '', '', '', '', '', '', 'DRAFT', 1, ?, ?)`)
        .bind(sessionId, caseIdentifier, stage.order, stage.code, scheduledAt, now, now),
      database.prepare(`INSERT INTO practice_session_revisions
        (revision_id, session_id, case_id, revision, event_type, actor, snapshot_json, created_at)
        VALUES (?, ?, ?, 1, 'CREATED', 'CJ', ?, ?)`).bind(crypto.randomUUID(), sessionId, caseIdentifier, JSON.stringify(snapshot), now),
    ],
  };
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
      const journey = journeyStagesForService(payload.client.serviceCode).map((stage) => newJourneyStageStatements(database, identifier, stage, now));
      await database.batch([
        database.prepare(`INSERT INTO practice_clients
          (case_id, display_name, child_age, region, concern, stage, service_code, next_action, source_status,
           known_facts_json, open_questions_json, boundary_flags_json, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(identifier, ...values, now, now),
        database.prepare(`INSERT INTO practice_client_revisions
          (revision_id, case_id, revision, event_type, actor, reason, snapshot_json, created_at)
          VALUES (?, ?, 1, 'CREATED', 'CJ', ?, ?, ?)`).bind(crypto.randomUUID(), identifier, payload.reason.trim(), JSON.stringify(snapshot), now),
        ...journey.flatMap((item) => item.statements),
      ]);
      return json(await overview(database, { action: payload.action, caseId: identifier, sessionId: journey[0]?.sessionId || null }), 201);
    }

    if (payload.action === "update_client") {
      const current = await database.prepare("SELECT * FROM practice_clients WHERE case_id = ?").bind(payload.caseId).first();
      if (!current) return json({ error: "Client record was not found." }, 404);
      if (Number(current.revision) !== payload.expectedRevision) return json({ error: "Client record changed on another screen. Refresh before saving." }, 409);
      if (current.service_code === "CUSTOM" && !["RM350", "RM1800"].includes(payload.client.serviceCode)) return json({ error: "Legacy CUSTOM cases must be explicitly reclassified as RM350 or RM1,800 before saving." }, 409);
      const existingSessions = await database.prepare("SELECT session_id FROM practice_sessions WHERE case_id = ? LIMIT 1").bind(payload.caseId).all();
      if (current.service_code !== payload.client.serviceCode && (existingSessions.results || []).length) return json({ error: "A service cannot be changed after its journey has started. Create a new case so the RM350 and RM1,800 boundaries remain separate." }, 409);
      const nextRevision = payload.expectedRevision + 1;
      const values = clientValues(payload.client);
      const snapshot = clientSnapshot(payload.caseId, payload.client, nextRevision, now);
      const journey = current.service_code !== payload.client.serviceCode
        ? journeyStagesForService(payload.client.serviceCode).map((stage) => newJourneyStageStatements(database, payload.caseId, stage, now))
        : [];
      await database.batch([
        database.prepare(`UPDATE practice_clients SET display_name = ?, child_age = ?, region = ?, concern = ?, stage = ?,
          service_code = ?, next_action = ?, source_status = ?, known_facts_json = ?, open_questions_json = ?, boundary_flags_json = ?,
          revision = ?, updated_at = ? WHERE case_id = ? AND revision = ?`).bind(...values, nextRevision, now, payload.caseId, payload.expectedRevision),
        database.prepare(`INSERT INTO practice_client_revisions
          (revision_id, case_id, revision, event_type, actor, reason, snapshot_json, created_at)
          VALUES (?, ?, ?, 'UPDATED', 'CJ', ?, ?, ?)`).bind(crypto.randomUUID(), payload.caseId, nextRevision, payload.reason.trim(), JSON.stringify(snapshot), now),
        ...journey.flatMap((item) => item.statements),
      ]);
      return json(await overview(database, { action: payload.action, caseId: payload.caseId, sessionId: journey[0]?.sessionId || null }));
    }

    if (payload.action === "create_session") {
      const client = await database.prepare("SELECT case_id, service_code FROM practice_clients WHERE case_id = ? AND archived_at IS NULL").bind(payload.caseId).first();
      if (!client) return json({ error: "Active client record was not found." }, 404);
      const existing = await database.prepare("SELECT journey_stage FROM practice_sessions WHERE case_id = ?").bind(payload.caseId).all();
      const present = new Set((existing.results || []).map((row) => row.journey_stage));
      const template = journeyStagesForService(client.service_code);
      if (!template.length) return json({ error: "Choose RM350 or RM1,800 before creating a client journey." }, 409);
      const stage = template.find((item) => !present.has(item.code));
      if (!stage) return json({ error: "All client journey stages already exist." }, 409);
      const created = newJourneyStageStatements(database, payload.caseId, stage, now, payload.scheduledAt);
      await database.batch(created.statements);
      const { sessionId } = created;
      return json(await overview(database, { action: payload.action, caseId: payload.caseId, sessionId }), 201);
    }

    if (payload.action === "save_session") {
      const current = await database.prepare("SELECT * FROM practice_sessions WHERE session_id = ?").bind(payload.sessionId).first();
      if (!current) return json({ error: "Session record was not found." }, 404);
      if (Number(current.revision) !== payload.expectedRevision) return json({ error: "Session changed on another screen. Refresh before saving." }, 409);
      if (payload.session.journeyStage !== current.journey_stage) return json({ error: "Client journey stages cannot be reordered or renamed." }, 409);
      const nextRevision = payload.expectedRevision + 1;
      const eventType = payload.session.documentStatus === "CJ_APPROVED" && current.document_status !== "CJ_APPROVED" ? "APPROVED" : payload.session.documentStatus === "DELIVERED" ? "DELIVERED" : "UPDATED";
      const snapshot = sessionSnapshot(payload.sessionId, current.case_id, Number(current.session_number), payload.session, nextRevision, now);
      await database.batch([
        database.prepare(`UPDATE practice_sessions SET status = ?, scheduled_at = ?, occurred_at = ?, preparation = ?,
          template_answers = ?, private_notes = ?, parent_summary = ?, action_plan = ?, parent_materials = ?, document_status = ?, revision = ?, updated_at = ?
          WHERE session_id = ? AND revision = ?`).bind(payload.session.status, payload.session.scheduledAt, payload.session.occurredAt,
          payload.session.preparation, payload.session.templateAnswers, payload.session.privateNotes, payload.session.parentSummary,
          payload.session.actionPlan, payload.session.parentMaterials, payload.session.documentStatus, nextRevision, now, payload.sessionId, payload.expectedRevision),
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
      const filename = safeFilename(client.case_id, client.service_code, session.journey_stage, documentVersion, now.slice(0, 10));
      if (!existing) {
        const statements = [database.prepare(`INSERT INTO practice_exports
          (export_id, case_id, session_id, document_type, document_version, destination, filename, content_sha256,
           byte_size, provider_file_id, status, created_at) VALUES (?, ?, ?, 'FOLLOW_THROUGH_PACK', ?, ?, ?, ?, ?, NULL, ?, ?)`)
          .bind(exportId, client.case_id, payload.sessionId, documentVersion, destination, filename, contentSha256, new TextEncoder().encode(content).byteLength, destination === "LOCAL" ? "SAVED" : "QUEUED", now)];
        if (destination === "LOCAL" && session.document_status === "CJ_APPROVED") {
          const nextRevision = Number(session.revision) + 1;
          const nextSession = editableSessionFromRow(session, { documentStatus: "EXPORTED" });
          statements.push(
            database.prepare("UPDATE practice_sessions SET document_status = 'EXPORTED', revision = ?, updated_at = ? WHERE session_id = ? AND revision = ?").bind(nextRevision, now, payload.sessionId, Number(session.revision)),
            database.prepare(`INSERT INTO practice_session_revisions
              (revision_id, session_id, case_id, revision, event_type, actor, snapshot_json, created_at)
              VALUES (?, ?, ?, ?, 'UPDATED', 'CJ', ?, ?)`).bind(crypto.randomUUID(), payload.sessionId, session.case_id, nextRevision, JSON.stringify(sessionSnapshot(payload.sessionId, session.case_id, Number(session.session_number), nextSession, nextRevision, now)), now),
          );
        }
        await database.batch(statements);
      }
      return json({ ...(await overview(database, { action: payload.action, caseId: client.case_id, sessionId: payload.sessionId, exportId })), download: { exportId, filename, content, contentSha256, destination, status: existing?.status || (destination === "LOCAL" ? "SAVED" : "QUEUED") } });
    }

    if (payload.action === "confirm_drive_export") {
      const queued = await database.prepare("SELECT * FROM practice_exports WHERE export_id = ? AND destination = 'GOOGLE_DRIVE' AND status = 'QUEUED'").bind(payload.exportId).first();
      if (!queued) return json({ error: "Queued Drive export was not found." }, 404);
      const session = await database.prepare("SELECT * FROM practice_sessions WHERE session_id = ?").bind(queued.session_id).first();
      const statements = [database.prepare("UPDATE practice_exports SET provider_file_id = ?, status = 'SAVED' WHERE export_id = ? AND status = 'QUEUED'").bind(payload.providerFileId.trim(), payload.exportId)];
      if (session && session.document_status === "CJ_APPROVED" && Number(session.revision) === Number(queued.document_version)) {
        const nextRevision = Number(session.revision) + 1;
        const nextSession = editableSessionFromRow(session, { documentStatus: "EXPORTED" });
        statements.push(
          database.prepare("UPDATE practice_sessions SET document_status = 'EXPORTED', revision = ?, updated_at = ? WHERE session_id = ? AND revision = ?").bind(nextRevision, now, session.session_id, Number(session.revision)),
          database.prepare(`INSERT INTO practice_session_revisions
            (revision_id, session_id, case_id, revision, event_type, actor, snapshot_json, created_at)
            VALUES (?, ?, ?, ?, 'UPDATED', 'CJ', ?, ?)`).bind(crypto.randomUUID(), session.session_id, session.case_id, nextRevision, JSON.stringify(sessionSnapshot(session.session_id, session.case_id, Number(session.session_number), nextSession, nextRevision, now)), now),
        );
      }
      await database.batch(statements);
      return json(await overview(database, { action: payload.action, exportId: payload.exportId }));
    }

    if (payload.action === "mark_delivered") {
      const session = await database.prepare("SELECT * FROM practice_sessions WHERE session_id = ?").bind(payload.sessionId).first();
      if (!session) return json({ error: "Session record was not found." }, 404);
      if (Number(session.revision) !== payload.expectedRevision) return json({ error: "Session changed on another screen. Refresh before saving." }, 409);
      if (session.document_status !== "EXPORTED") return json({ error: "A recorded saved export is required before delivery." }, 409);
      const saved = await database.prepare("SELECT export_id FROM practice_exports WHERE session_id = ? AND status = 'SAVED' LIMIT 1").bind(payload.sessionId).first();
      if (!saved) return json({ error: "A recorded saved export is required before delivery." }, 409);
      const nextRevision = Number(session.revision) + 1;
      const nextSession = editableSessionFromRow(session, { status: "DELIVERED", documentStatus: "DELIVERED" });
      await database.batch([
        database.prepare("UPDATE practice_sessions SET status = 'DELIVERED', document_status = 'DELIVERED', revision = ?, updated_at = ? WHERE session_id = ? AND revision = ?").bind(nextRevision, now, payload.sessionId, Number(session.revision)),
        database.prepare(`INSERT INTO practice_session_revisions
          (revision_id, session_id, case_id, revision, event_type, actor, snapshot_json, created_at)
          VALUES (?, ?, ?, ?, 'DELIVERED', 'CJ', ?, ?)`).bind(crypto.randomUUID(), payload.sessionId, session.case_id, nextRevision, JSON.stringify(sessionSnapshot(payload.sessionId, session.case_id, Number(session.session_number), nextSession, nextRevision, now)), now),
      ]);
      return json(await overview(database, { action: payload.action, caseId: session.case_id, sessionId: payload.sessionId }));
    }
  } catch (error) {
    if (isRevisionConflict(error)) return json({ error: "The record changed on another screen. Refresh before saving." }, 409);
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
