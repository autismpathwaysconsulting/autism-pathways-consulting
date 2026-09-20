import {
  PATHWAYS_SCHEMA_VERSION,
  assertValidPathwaysState,
  canonicalPathwaysState,
  createEmptyPathwaysState,
} from '../../../pathways/schema.js';
import { sha256Hex } from './auth.js';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function localDateKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dateHasStarted(value, now, timeZone) {
  if (!value) return true;
  if (DATE_ONLY_RE.test(value)) return value <= localDateKey(now, timeZone);
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant <= now.getTime();
}

function dateHasNotExpired(value, now, timeZone) {
  if (!value) return true;
  if (DATE_ONLY_RE.test(value)) return value >= localDateKey(now, timeZone);
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant >= now.getTime();
}

async function authorityStillCurrent(db, student, authorityDecision, now = new Date()) {
  if (student.is_synthetic_demo === 1) return true;
  if (!authorityDecision || !Number.isSafeInteger(authorityDecision.decisionSequence)) return false;
  const row = await db.prepare(`SELECT c.rowid AS decision_sequence, c.status, c.granted_at, c.expires_at, o.timezone
    FROM pathways_consents c
    JOIN pathways_students s ON s.student_id = c.student_id
    JOIN pathways_organizations o ON o.organization_id = s.organization_id
    WHERE c.student_id = ? AND c.consent_type IN ('pilot-use','school-record')
    ORDER BY c.rowid DESC
    LIMIT 1`)
    .bind(student.student_id)
    .first();
  if (!row || Number(row.decision_sequence) !== authorityDecision.decisionSequence) return false;
  if (!['granted','not-required'].includes(row.status)) return false;
  if (!dateHasStarted(row.granted_at, now, row.timezone)) return false;
  if (!dateHasNotExpired(row.expires_at, now, row.timezone)) return false;
  return true;
}

export async function createStudentState({ db, student, actorUserId, state = null }) {
  const initialState = state ? canonicalPathwaysState(state) : createEmptyPathwaysState();
  assertValidPathwaysState(initialState);
  const stateJson = JSON.stringify(initialState);
  const stateHash = await sha256Hex(stateJson);
  const now = new Date().toISOString();
  const requestId = `create:${student.student_id}:${crypto.randomUUID()}`;

  await db.prepare(`INSERT INTO pathways_student_state
    (student_id, schema_version, revision, state_json, state_hash, updated_at, updated_by, last_action, last_request_id)
    VALUES (?, ?, 0, ?, ?, ?, ?, 'create', ?)`)
    .bind(student.student_id, PATHWAYS_SCHEMA_VERSION, stateJson, stateHash, now, actorUserId, requestId)
    .run();

  return {
    schemaVersion: PATHWAYS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    updatedBy: actorUserId,
    stateHash,
    lastAction: 'create',
    lastRequestId: requestId,
    state: initialState,
  };
}

export async function readStudentState(db, studentId) {
  const row = await db.prepare(`SELECT schema_version, revision, state_json, state_hash, updated_at, updated_by,
      last_action, last_request_id
    FROM pathways_student_state WHERE student_id = ?`)
    .bind(studentId)
    .first();
  if (!row) return null;
  if (!validRevision(row.revision) || row.schema_version !== PATHWAYS_SCHEMA_VERSION) throw new Error('Stored Pathways state metadata is invalid.');
  const state = JSON.parse(row.state_json);
  assertValidPathwaysState(state);
  const computedHash = await sha256Hex(JSON.stringify(state));
  if (computedHash !== row.state_hash) throw new Error('Stored Pathways state hash does not match the canonical record.');
  return {
    schemaVersion: row.schema_version,
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    stateHash: row.state_hash,
    lastAction: row.last_action,
    lastRequestId: row.last_request_id,
    state,
  };
}

export async function listRevisions(db, studentId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await db.prepare(`SELECT revision, schema_version, state_hash, action, request_id,
      actor_user_id, created_at
    FROM pathways_state_revisions
    WHERE student_id = ?
    ORDER BY revision DESC
    LIMIT ?`)
    .bind(studentId, safeLimit)
    .all();
  return result?.results || [];
}

export async function readRevision(db, studentId, revision) {
  if (!validRevision(revision)) return null;
  const row = await db.prepare(`SELECT revision, schema_version, state_json, state_hash, action,
      request_id, actor_user_id, created_at
    FROM pathways_state_revisions
    WHERE student_id = ? AND revision = ?`)
    .bind(studentId, revision)
    .first();
  if (!row) return null;
  const state = JSON.parse(row.state_json);
  assertValidPathwaysState(state);
  const computed = await sha256Hex(JSON.stringify(state));
  if (computed !== row.state_hash) throw new Error('Stored Pathways revision hash is invalid.');
  return { ...row, state };
}

export async function writeStudentState({
  db,
  student,
  actorUserId,
  state,
  expectedRevision,
  action = 'edit',
  requestId,
  authorityDecision = null,
}) {
  if (!validRevision(expectedRevision)) throw new TypeError('expectedRevision is invalid.');
  if (!validRequestId(requestId)) throw new TypeError('requestId is invalid.');
  const canonical = canonicalPathwaysState(state);
  const stateJson = JSON.stringify(canonical);
  const stateHash = await sha256Hex(stateJson);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const nextRevision = expectedRevision + 1;

  const existingReplay = await db.prepare(`SELECT revision, state_hash FROM pathways_state_revisions
    WHERE student_id = ? AND request_id = ?`)
    .bind(student.student_id, requestId)
    .first();
  if (existingReplay) {
    const current = await readStudentState(db, student.student_id);
    if (existingReplay.revision === current?.revision && existingReplay.state_hash === stateHash) {
      return { conflict: false, idempotent: true, record: current };
    }
    return { conflict: true, idempotent: false, record: current };
  }

  const sequence = Number.isSafeInteger(authorityDecision?.decisionSequence)
    ? authorityDecision.decisionSequence
    : null;
  const localDate = localDateKey(nowDate, authorityDecision?.timeZone || 'UTC');

  // Revision and matching audit are created by the update trigger in this same SQLite transaction.
  // The predicates below also close both lifecycle and authority-revocation races between the
  // earlier API authorization read and this canonical write.
  const result = await db.prepare(`UPDATE pathways_student_state
    SET schema_version = ?, revision = ?, state_json = ?, state_hash = ?,
        updated_at = ?, updated_by = ?, last_action = ?, last_request_id = ?
    WHERE student_id = ? AND revision = ?
      AND EXISTS (
        SELECT 1 FROM pathways_students s
        WHERE s.student_id = pathways_student_state.student_id
          AND s.status = 'active'
          AND (
            s.is_synthetic_demo = 1
            OR EXISTS (
              SELECT 1 FROM pathways_consents c
              WHERE c.student_id = s.student_id
                AND c.consent_type IN ('pilot-use','school-record')
                AND c.rowid = ?
                AND c.rowid = (
                  SELECT c2.rowid FROM pathways_consents c2
                  WHERE c2.student_id = s.student_id
                    AND c2.consent_type IN ('pilot-use','school-record')
                  ORDER BY c2.rowid DESC LIMIT 1
                )
                AND c.status IN ('granted','not-required')
                AND (
                  c.granted_at IS NULL
                  OR (length(c.granted_at) = 10 AND c.granted_at <= ?)
                  OR (length(c.granted_at) > 10 AND c.granted_at <= ?)
                )
                AND (
                  c.expires_at IS NULL
                  OR (length(c.expires_at) = 10 AND c.expires_at >= ?)
                  OR (length(c.expires_at) > 10 AND c.expires_at >= ?)
                )
            )
          )
      )`)
    .bind(
      PATHWAYS_SCHEMA_VERSION,
      nextRevision,
      stateJson,
      stateHash,
      now,
      actorUserId,
      action,
      requestId,
      student.student_id,
      expectedRevision,
      sequence,
      localDate,
      now,
      localDate,
      now,
    )
    .run();
  const changes = Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
  if (changes === 0) {
    const current = await readStudentState(db, student.student_id);
    if (current?.lastRequestId === requestId && current.stateHash === stateHash) {
      return { conflict: false, idempotent: true, record: current };
    }
    if (!await authorityStillCurrent(db, student, authorityDecision)) {
      return { authorityBlocked: true, conflict: false, idempotent: false, record: current };
    }
    return { conflict: true, idempotent: false, record: current };
  }

  return {
    conflict: false,
    idempotent: false,
    record: {
      schemaVersion: PATHWAYS_SCHEMA_VERSION,
      revision: nextRevision,
      updatedAt: now,
      updatedBy: actorUserId,
      stateHash,
      lastAction: action,
      lastRequestId: requestId,
      state: canonical,
    },
  };
}

export async function restoreStudentRevision({ db, student, actorUserId, revision, expectedRevision, requestId, authorityDecision = null }) {
  const historic = await readRevision(db, student.student_id, revision);
  if (!historic) return { notFound: true };
  const result = await writeStudentState({
    db,
    student,
    actorUserId,
    state: historic.state,
    expectedRevision,
    action: `restore:${revision}`,
    requestId,
    authorityDecision,
  });
  return { ...result, restoredFromRevision: revision };
}
