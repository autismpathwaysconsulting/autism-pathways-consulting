import {
  authenticate,
  getStudentAccess,
  json,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';
import {
  listRevisions,
  readRevision,
  readStudentState,
  restoreStudentRevision,
  writeStudentState,
} from '../../lib/pathways/state.js';

const ACTIONS = new Set(['edit','import','reset']);

async function hasUseAuthority(db, student) {
  if (student.external_ref === 'SYNTHETIC-DEMO') return true;
  const row = await db.prepare(`SELECT consent_id FROM pathways_consents
    WHERE student_id = ? AND consent_type IN ('pilot-use','school-record')
      AND status IN ('granted','not-required')
      AND (expires_at IS NULL OR expires_at = '' OR expires_at >= ?)
    ORDER BY created_at DESC LIMIT 1`)
    .bind(student.student_id, new Date().toISOString().slice(0, 10))
    .first();
  return Boolean(row);
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId') || '';
  const access = await getStudentAccess(auth, studentId, { write: false });
  if (!access.ok) return json({ error: access.error }, access.status);
  try {
    if (url.searchParams.has('revision')) {
      const revision = Number(url.searchParams.get('revision'));
      const historic = await readRevision(auth.db, studentId, revision);
      if (!historic) return json({ error: 'Revision was not found.' }, 404);
      return json({
        student: access.student,
        permission: access.permission,
        role: access.role,
        revision: historic,
      });
    }
    const record = await readStudentState(auth.db, studentId);
    if (!record) return json({ error: 'Student state was not initialized.' }, 404);
    const revisions = url.searchParams.get('history') === '1'
      ? await listRevisions(auth.db, studentId, Number(url.searchParams.get('limit') || 20))
      : undefined;
    return json({
      student: access.student,
      permission: access.permission,
      role: access.role,
      record,
      ...(revisions ? { revisions } : {}),
    });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways state read failed', errorType: String(error?.name || 'Error'), studentId }));
    return json({ error: 'Student state is temporarily unavailable.' }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 2.2 * 1024 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const studentId = String(payload.studentId || '');
  const access = await getStudentAccess(auth, studentId, { write: true });
  if (!access.ok) return json({ error: access.error }, access.status);
  if (!await hasUseAuthority(auth.db, access.student)) {
    return json({ error: 'A school/pilot use-authority record must be recorded before support data can be saved for this student.' }, 409);
  }
  const action = String(payload.action || 'edit');
  if (!ACTIONS.has(action)) return json({ error: 'State action is invalid.' }, 400);
  if ((action === 'reset' || action === 'import') && !auth.user.platformAdmin && !['admin','senco'].includes(access.role)) {
    return json({ error: 'Only an administrator or SENCO can import or reset a student record.' }, 403);
  }
  try {
    const result = await writeStudentState({
      db: auth.db,
      student: access.student,
      actorUserId: auth.user.id,
      state: payload.state,
      expectedRevision: payload.expectedRevision,
      action,
      requestId: payload.requestId,
    });
    return json({
      conflict: result.conflict,
      idempotent: result.idempotent,
      record: result.record,
    }, result.conflict ? 409 : 200);
  } catch (error) {
    if (error instanceof TypeError) return json({ error: String(error.message || 'Student state is invalid.') }, 400);
    console.error(JSON.stringify({ message: 'Pathways state write failed', errorType: String(error?.name || 'Error'), studentId }));
    return json({ error: 'Student state could not be saved.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 32 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  if (payload.action !== 'restore') return json({ error: 'Unsupported state operation.' }, 400);
  const studentId = String(payload.studentId || '');
  const access = await getStudentAccess(auth, studentId, { write: true });
  if (!access.ok) return json({ error: access.error }, access.status);
  if (!auth.user.platformAdmin && !['admin','senco'].includes(access.role)) return json({ error: 'Only an administrator or SENCO can restore historical revisions.' }, 403);
  try {
    const result = await restoreStudentRevision({
      db: auth.db,
      student: access.student,
      actorUserId: auth.user.id,
      revision: Number(payload.revision),
      expectedRevision: payload.expectedRevision,
      requestId: payload.requestId,
    });
    if (result.notFound) return json({ error: 'Revision was not found.' }, 404);
    return json(result, result.conflict ? 409 : 200);
  } catch (error) {
    if (error instanceof TypeError) return json({ error: String(error.message || 'Restore request is invalid.') }, 400);
    console.error(JSON.stringify({ message: 'Pathways state restore failed', errorType: String(error?.name || 'Error'), studentId }));
    return json({ error: 'Historical revision could not be restored.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PUT') return onRequestPut(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PUT, POST' });
}
