import { authenticate, getStudentAccess, json } from '../../lib/pathways/auth.js';
import { listRevisions, readRevision, readStudentState } from '../../lib/pathways/state.js';

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const studentId = url.searchParams.get('studentId') || '';
  const includeHistory = url.searchParams.get('history') === '1';
  const access = await getStudentAccess(auth, studentId, { write: false });
  if (!access.ok) return json({ error: access.error }, access.status);

  try {
    const [record, consentResult] = await Promise.all([
      readStudentState(auth.db, studentId),
      auth.db.prepare(`SELECT consent_type, status, authority_label, reference_note, granted_at, expires_at,
          created_at, updated_at
        FROM pathways_consents WHERE student_id = ? ORDER BY created_at`)
        .bind(studentId)
        .all(),
    ]);
    if (!record) return json({ error: 'Student state was not found.' }, 404);

    let history = [];
    if (includeHistory) {
      const metadata = await listRevisions(auth.db, studentId, 100);
      history = [];
      for (const item of [...metadata].reverse()) {
        const revision = await readRevision(auth.db, studentId, Number(item.revision));
        if (revision) {
          history.push({
            revision: revision.revision,
            schemaVersion: revision.schema_version,
            action: revision.action,
            requestId: revision.request_id,
            actorUserId: revision.actor_user_id,
            createdAt: revision.created_at,
            stateHash: revision.state_hash,
            state: revision.state,
          });
        }
      }
    }

    const body = {
      exportVersion: '1.0',
      generatedAt: new Date().toISOString(),
      student: {
        id: access.student.student_id,
        organizationId: access.student.organization_id,
        displayName: access.student.display_name,
        externalRef: access.student.external_ref,
        yearGroup: access.student.year_group,
        status: access.student.status,
        createdAt: access.student.created_at,
        updatedAt: access.student.updated_at,
      },
      consents: consentResult?.results || [],
      current: record,
      ...(includeHistory ? { history } : {}),
    };
    const filename = `pathways-${studentId}-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways export failed', errorType: String(error?.name || 'Error'), studentId }));
    return json({ error: 'Student export is temporarily unavailable.' }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  return onRequestGet(context);
}
