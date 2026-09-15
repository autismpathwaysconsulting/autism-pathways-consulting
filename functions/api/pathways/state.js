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
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function localDateKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0,10);
  }
}

export async function hasUseAuthority(db, student, now = new Date()) {
  if (student.external_ref === 'SYNTHETIC-DEMO') return true;
  const row = await db.prepare(`SELECT c.consent_id, c.status, c.expires_at, c.created_at,
      o.timezone
    FROM pathways_consents c
    JOIN pathways_students s ON s.student_id = c.student_id
    JOIN pathways_organizations o ON o.organization_id = s.organization_id
    WHERE c.student_id = ? AND c.consent_type IN ('pilot-use','school-record')
    ORDER BY c.created_at DESC, c.consent_id DESC
    LIMIT 1`)
    .bind(student.student_id)
    .first();
  if (!row) return false;
  if (!['granted','not-required'].includes(row.status)) return false;
  if (row.expires_at) {
    if (DATE_ONLY_RE.test(row.expires_at)) {
      if (row.expires_at < localDateKey(now, row.timezone)) return false;
    } else {
      const expiresAt = Date.parse(row.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt < now.getTime()) return false;
    }
  }
  return true;
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
      return json({ student: access.student, permission: access.permission, role: access.role, revision: historic });
    }
    const record = await readStudentState(auth.db, studentId);
    if (!record) return json({ error: 'Student state was not initialized.' }, 404);
    const revisions = url.searchParams.get('history') === '1'
      ? await listRevisions(auth.db, studentId, Number(url.searchParams.get('limit') || 20))
      : undefined;
    return json({ student: access.student, permission: access.permission, role: access.role, record, ...(revisions ? { revisions } : {}) });
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
    return json({ error: 'A current school/pilot use-authority record is required before support data can be saved for this student.' }, 409);
  }
  const action = String(payload.action || 'edit');
  if (!ACTIONS.has(action)) return json({ error: 'State action is invalid.' }, 400);
  if ((action === 'reset' || action === 'import') && !auth.user.platformAdmin && !['admin','senco'].includes(access.role)) {
    return json({ error: 'Only an administrator or SENCO can import or reset a student record.' }, 403);
  }
  try {
    const result = await writeStudentState({ db: auth.db, student: access.student, actorUserId: auth.user.id, state: payload.state, expectedRevision: payload.expectedRevision, action, requestId: payload.requestId });
    return json({ conflict: result.conflict, idempotent: result.idempotent, record: result.record }, result.conflict ? 409 : 200);
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
  if (!await hasUseAuthority(auth.db, access.student)) {
    return json({ error: 'A current school/pilot use-authority record is required before historical support data can be restored.' }, 409);
  }
  if (!auth.user.platformAdmin && !['admin','senco'].includes(access.role)) return json({ error: 'Only an administrator or SENCO can restore historical revisions.' }, 403);
  try {
    const result = await restoreStudentRevision({ db: auth.db, student: access.student, actorUserId: auth.user.id, revision: Number(payload.revision), expectedRevision: payload.expectedRevision, requestId: payload.requestId });
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
