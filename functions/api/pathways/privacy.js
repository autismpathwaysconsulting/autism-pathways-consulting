import {
  authenticate,
  getStudentAccess,
  json,
  membershipFor,
  readJson,
  requireWriteRequest,
  sha256Hex,
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
  const access = await getStudentAccess(auth, studentId, { write: true, includeArchived: true });
  if (!access.ok) return json({ error: access.error }, access.status);
  if (!canErase(auth, access.student.organization_id)) return json({ error: 'Only an organisation administrator can erase a student workspace.' }, 403);
  if (String(payload.confirmStudentId || '') !== studentId) return json({ error: 'Student erasure confirmation did not match.' }, 400);
  const reasonCode = String(payload.reasonCode || '').trim();
  if (!['request','pilot-ended','wrong-record','retention-expired','other'].includes(reasonCode)) return json({ error: 'Erasure reason is invalid.' }, 400);

  const now = new Date().toISOString();
  const erasedStudentHash = await sha256Hex(studentId);
  const requestId = `erase:${crypto.randomUUID()}`;
  try {
    const results = await auth.db.batch([
      auth.db.prepare(`INSERT INTO pathways_erasure_guard (student_id, created_at) VALUES (?, ?)`)
        .bind(studentId, now),
      auth.db.prepare(`INSERT INTO pathways_erasure_log
        (organization_id, erased_student_hash, actor_user_id, reason_code, created_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(access.student.organization_id, erasedStudentHash, auth.user.id, reasonCode, now),
      auth.db.prepare('DELETE FROM pathways_audit_log WHERE student_id = ?').bind(studentId),
      auth.db.prepare('DELETE FROM pathways_students WHERE student_id = ?').bind(studentId),
      auth.db.prepare(`INSERT INTO pathways_audit_log
        (organization_id, student_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, created_at)
        VALUES (?, NULL, ?, 'erase-student', 'student-erasure', NULL, ?, ?, ?)`)
        .bind(access.student.organization_id, auth.user.id, requestId, JSON.stringify({ reasonCode }), now),
      auth.db.prepare('DELETE FROM pathways_erasure_guard WHERE student_id = ?').bind(studentId),
    ]);
    const deleted = Number(results?.[3]?.meta?.changes ?? results?.[3]?.meta?.rows_written ?? 0);
    if (deleted !== 1) throw new Error('Student erasure did not delete exactly one record.');
    return json({ ok: true, erasedAt: now });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways student erasure failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Student record could not be erased.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
