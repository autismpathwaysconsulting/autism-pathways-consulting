import {
  authenticate,
  audit,
  getStudentAccess,
  json,
  membershipFor,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';

function canErase(auth, organizationId) {
  if (auth.user.platformAdmin) return true;
  return membershipFor(auth.user, organizationId)?.role === 'admin';
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  if (payload.action !== 'erase-student') return json({ error: 'Unsupported privacy action.' }, 400);
  const studentId = String(payload.studentId || '');
  const access = await getStudentAccess(auth, studentId, { write: true });
  if (!access.ok) return json({ error: access.error }, access.status);
  if (!canErase(auth, access.student.organization_id)) return json({ error: 'Only an organisation administrator can erase a student workspace.' }, 403);
  if (String(payload.confirmStudentId || '') !== studentId) return json({ error: 'Student erasure confirmation did not match.' }, 400);
  const reasonCode = String(payload.reasonCode || '').trim();
  if (!['request','pilot-ended','wrong-record','retention-expired','other'].includes(reasonCode)) return json({ error: 'Erasure reason is invalid.' }, 400);

  const now = new Date().toISOString();
  try {
    await auth.db.prepare(`INSERT INTO pathways_erasure_log
      (organization_id, erased_student_id, actor_user_id, reason_code, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(access.student.organization_id, studentId, auth.user.id, reasonCode, now)
      .run();
    await audit(auth.db, {
      organizationId: access.student.organization_id,
      studentId,
      actorUserId: auth.user.id,
      action: 'erase-student',
      entityType: 'student',
      entityId: studentId,
      metadata: { reasonCode },
    });
    await auth.db.prepare('DELETE FROM pathways_students WHERE student_id = ?').bind(studentId).run();
    return json({ ok: true, erasedStudentId: studentId, erasedAt: now });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways student erasure failed', errorType: String(error?.name || 'Error'), studentId }));
    return json({ error: 'Student record could not be erased.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
