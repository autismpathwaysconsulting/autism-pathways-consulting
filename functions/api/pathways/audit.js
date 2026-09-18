import { authenticate, json, membershipFor } from '../../lib/pathways/auth.js';

function canAudit(auth, organizationId) {
  if (auth.user.platformAdmin) return true;
  const role = membershipFor(auth.user, organizationId)?.role;
  return role === 'admin' || role === 'senco';
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId') || '';
  const studentId = url.searchParams.get('studentId') || '';
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
  if (!organizationId || !canAudit(auth, organizationId)) return json({ error: 'You do not have permission to view the audit trail.' }, 403);

  let result;
  if (studentId) {
    const student = await auth.db.prepare('SELECT student_id, organization_id FROM pathways_students WHERE student_id = ?')
      .bind(studentId).first();
    if (!student || student.organization_id !== organizationId) return json({ error: 'Student was not found in this organisation.' }, 404);
    result = await auth.db.prepare(`SELECT a.audit_id, a.organization_id, a.student_id, a.actor_user_id,
        u.display_name AS actor_name, a.action, a.entity_type, a.entity_id, a.metadata_json, a.created_at
      FROM pathways_audit_log a
      LEFT JOIN pathways_users u ON u.user_id = a.actor_user_id
      WHERE a.organization_id = ? AND a.student_id = ?
      ORDER BY a.created_at DESC LIMIT ?`)
      .bind(organizationId, studentId, limit).all();
  } else {
    result = await auth.db.prepare(`SELECT a.audit_id, a.organization_id, a.student_id, a.actor_user_id,
        u.display_name AS actor_name, a.action, a.entity_type, a.entity_id, a.metadata_json, a.created_at
      FROM pathways_audit_log a
      LEFT JOIN pathways_users u ON u.user_id = a.actor_user_id
      WHERE a.organization_id = ?
      ORDER BY a.created_at DESC LIMIT ?`)
      .bind(organizationId, limit).all();
  }
  const events = (result?.results || []).map(row => ({
    ...row,
    metadata: row.metadata_json ? (() => { try { return JSON.parse(row.metadata_json); } catch { return null; } })() : null,
    metadata_json: undefined,
  }));
  return json({ events });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  return onRequestGet(context);
}
