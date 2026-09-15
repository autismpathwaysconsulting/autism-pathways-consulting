import {
  PATHWAYS_SCHEMA_VERSION,
  assertValidPathwaysState,
  canonicalPathwaysState,
  createEmptyPathwaysState,
} from '../../../pathways/schema.js';
import { sha256Hex } from './auth.js';

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

export async function createStudentState({ db, student, actorUserId, state = null }) {
  const initialState = state ? canonicalPathwaysState(state) : createEmptyPathwaysState();
  assertValidPathwaysState(initialState);
  const stateJson = JSON.stringify(initialState);
  const stateHash = await sha256Hex(stateJson);
  const now = new Date().toISOString();
  const requestId = `create:${student.student_id}:${crypto.randomUUID()}`;

  // D1 trigger `pathways_state_history_after_insert` writes revision 0 and the
  // matching audit event inside this same SQLite statement transaction.
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
}) {
  if (!validRevision(expectedRevision)) throw new TypeError('expectedRevision is invalid.');
  if (!validRequestId(requestId)) throw new TypeError('requestId is invalid.');
  const canonical = canonicalPathwaysState(state);
  const stateJson = JSON.stringify(canonical);
  const stateHash = await sha256Hex(stateJson);
  const now = new Date().toISOString();
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

  // `pathways_state_history_after_update` creates the revision and audit rows
  // inside the UPDATE transaction. If either trigger insert fails, SQLite rolls
  // back this canonical UPDATE too, so current state can never outrun history.
  const result = await db.prepare(`UPDATE pathways_student_state
    SET schema_version = ?, revision = ?, state_json = ?, state_hash = ?,
        updated_at = ?, updated_by = ?, last_action = ?, last_request_id = ?
    WHERE student_id = ? AND revision = ?`)
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
    )
    .run();
  const changes = Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
  if (changes === 0) {
    const current = await readStudentState(db, student.student_id);
    if (current?.lastRequestId === requestId && current.stateHash === stateHash) {
      return { conflict: false, idempotent: true, record: current };
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

export async function restoreStudentRevision({ db, student, actorUserId, revision, expectedRevision, requestId }) {
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
  });
  return { ...result, restoredFromRevision: revision };
}
