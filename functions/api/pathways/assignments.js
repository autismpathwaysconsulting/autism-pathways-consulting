import {
  authenticate,
  json,
  membershipFor,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';

function canManage(auth, organizationId) {
  if (auth.user.platformAdmin) return true;
  const role = membershipFor(auth.user, organizationId)?.role;
  return role === 'admin' || role === 'senco';
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId') || '';
  const student = await auth.db.prepare('SELECT student_id, organization_id FROM pathways_students WHERE student_id = ?')
    .bind(studentId).first();
  if (!student || !canManage(auth, student.organization_id)) return json({ error: 'You do not have permission to view assignments.' }, 403);
  const result = await auth.db.prepare(`SELECT a.assignment_id, a.user_id, a.permission, a.created_at,
      u.display_name, u.email, m.role
    FROM pathways_student_assignments a
    JOIN pathways_users u ON u.user_id = a.user_id
    LEFT JOIN pathways_memberships m ON m.user_id = a.user_id AND m.organization_id = a.organization_id
    WHERE a.student_id = ?
    ORDER BY u.display_name COLLATE NOCASE`)
    .bind(studentId).all();
  return json({ assignments: result?.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 24 * 1024 });
  if (!parsed.ok) return parsed.response;
  const { studentId, userId } = parsed.value;
  const permission = parsed.value.permission === 'read' ? 'read' : parsed.value.permission === 'edit' ? 'edit' : null;
  if (!permission) return json({ error: 'Assignment permission is invalid.' }, 400);
  const student = await auth.db.prepare(`SELECT student_id, organization_id FROM pathways_students
    WHERE student_id = ? AND status = 'active'`)
    .bind(String(studentId || '')).first();
  if (!student || !canManage(auth, student.organization_id)) return json({ error: 'You do not have permission to manage assignments.' }, 403);
  const membership = await auth.db.prepare(`SELECT membership_id, role, is_active FROM pathways_memberships
    WHERE organization_id = ? AND user_id = ?`)
    .bind(student.organization_id, String(userId || '')).first();
  if (!membership || membership.is_active !== 1) return json({ error: 'The user is not an active member of this organisation.' }, 400);

  const now = new Date().toISOString();
  const id = `asg-${crypto.randomUUID()}`;
  const requestId = `assignment:${crypto.randomUUID()}`;
  try {
    await auth.db.batch([
      auth.db.prepare(`INSERT INTO pathways_student_assignments
        (assignment_id, organization_id, student_id, user_id, permission, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, student.organization_id, student.student_id, userId, permission, now),
      auth.db.prepare(`INSERT INTO pathways_audit_log
        (organization_id, student_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, created_at)
        VALUES (?, ?, ?, 'assign-user', 'assignment', ?, ?, ?, ?)`)
        .bind(
          student.organization_id,
          student.student_id,
          auth.user.id,
          id,
          requestId,
          JSON.stringify({ userId, permission }),
          now,
        ),
    ]);
    return json({ assignment: { assignment_id: id, organization_id: student.organization_id, student_id: student.student_id, user_id: userId, permission, created_at: now } }, 201);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return json({ error: 'This user is already assigned to the student.' }, 409);
    console.error(JSON.stringify({ message: 'Pathways assignment creation failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Assignment could not be created.' }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return parsed.response;
  const assignmentId = String(parsed.value.assignmentId || '');
  const assignment = await auth.db.prepare(`SELECT assignment_id, organization_id, student_id, user_id, permission
    FROM pathways_student_assignments WHERE assignment_id = ?`)
    .bind(assignmentId).first();
  if (!assignment || !canManage(auth, assignment.organization_id)) return json({ error: 'Assignment was not found or cannot be managed.' }, 404);
  const permission = parsed.value.permission === 'read' ? 'read' : parsed.value.permission === 'edit' ? 'edit' : null;
  if (!permission) return json({ error: 'Assignment permission is invalid.' }, 400);
  const now = new Date().toISOString();
  const requestId = `assignment-update:${crypto.randomUUID()}`;
  try {
    const results = await auth.db.batch([
      auth.db.prepare(`UPDATE pathways_student_assignments
        SET permission = ?
        WHERE assignment_id = ?
          AND EXISTS (
            SELECT 1 FROM pathways_students s
            WHERE s.student_id = pathways_student_assignments.student_id AND s.status = 'active'
          )`)
        .bind(permission, assignmentId),
      auth.db.prepare(`INSERT INTO pathways_audit_log
        (organization_id, student_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, created_at)
        SELECT a.organization_id, a.student_id, ?, 'update-assignment', 'assignment', a.assignment_id, ?, ?, ?
        FROM pathways_student_assignments a
        JOIN pathways_students s ON s.student_id = a.student_id
        WHERE a.assignment_id = ? AND s.status = 'active' AND changes() = 1`)
        .bind(auth.user.id, requestId, JSON.stringify({ permission }), now, assignmentId),
    ]);
    const changed = Number(results?.[0]?.meta?.changes ?? results?.[0]?.meta?.rows_written ?? 0);
    const audited = Number(results?.[1]?.meta?.changes ?? results?.[1]?.meta?.rows_written ?? 0);
    if (changed !== 1 || audited !== 1) return json({ error: 'Assignment changed, the student became inactive, or the record was erased before this update could commit.' }, 409);
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways assignment update failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Assignment could not be updated.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const url = new URL(request.url);
  const assignmentId = url.searchParams.get('assignmentId') || '';
  const assignment = await auth.db.prepare(`SELECT assignment_id, organization_id, student_id, user_id
    FROM pathways_student_assignments WHERE assignment_id = ?`)
    .bind(assignmentId).first();
  if (!assignment || !canManage(auth, assignment.organization_id)) return json({ error: 'Assignment was not found or cannot be managed.' }, 404);
  const now = new Date().toISOString();
  const requestId = `assignment-remove:${crypto.randomUUID()}`;
  try {
    const results = await auth.db.batch([
      auth.db.prepare(`DELETE FROM pathways_student_assignments
        WHERE assignment_id = ?
          AND EXISTS (
            SELECT 1 FROM pathways_students s
            WHERE s.student_id = pathways_student_assignments.student_id
          )`)
        .bind(assignmentId),
      auth.db.prepare(`INSERT INTO pathways_audit_log
        (organization_id, student_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, created_at)
        SELECT organization_id, student_id, ?, 'remove-assignment', 'assignment', ?, ?, ?, ?
        FROM pathways_students
        WHERE student_id = ? AND changes() = 1`)
        .bind(auth.user.id, assignmentId, requestId, JSON.stringify({ userId: assignment.user_id }), now, assignment.student_id),
    ]);
    const changed = Number(results?.[0]?.meta?.changes ?? results?.[0]?.meta?.rows_written ?? 0);
    const audited = Number(results?.[1]?.meta?.changes ?? results?.[1]?.meta?.rows_written ?? 0);
    if (changed !== 1 || audited !== 1) return json({ error: 'Assignment changed or the student was erased before removal could commit.' }, 409);
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways assignment removal failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Assignment could not be removed.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'PATCH') return onRequestPatch(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });
}
