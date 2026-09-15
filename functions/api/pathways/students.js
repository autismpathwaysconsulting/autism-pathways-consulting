import {
  authenticate,
  audit,
  getStudentAccess,
  json,
  membershipFor,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';
import { createStudentState } from '../../lib/pathways/state.js';
import { createEmptyPathwaysState, assertValidPathwaysState } from '../../../pathways/schema.js';

function canCreate(auth, organizationId) {
  if (auth.user.platformAdmin) return true;
  const role = membershipFor(auth.user, organizationId)?.role;
  return role === 'admin' || role === 'senco';
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId');
  const includeInactive = url.searchParams.get('includeInactive') === '1';

  let result;
  if (auth.user.platformAdmin) {
    const where = organizationId ? 'WHERE s.organization_id = ?' : '';
    const statusClause = includeInactive ? '' : `${where ? ' AND' : ' WHERE'} s.status = 'active'`;
    const query = `SELECT s.student_id, s.organization_id, s.display_name, s.external_ref, s.year_group,
        s.status, s.created_at, s.updated_at, o.name AS organization_name
      FROM pathways_students s
      JOIN pathways_organizations o ON o.organization_id = s.organization_id
      ${where}${statusClause}
      ORDER BY o.name COLLATE NOCASE, s.display_name COLLATE NOCASE`;
    result = organizationId
      ? await auth.db.prepare(query).bind(organizationId).all()
      : await auth.db.prepare(query).all();
  } else {
    const memberships = auth.user.memberships;
    if (!memberships.length) return json({ students: [] });
    const visibleOrgIds = organizationId
      ? memberships.filter(m => m.organization_id === organizationId).map(m => m.organization_id)
      : memberships.map(m => m.organization_id);
    if (!visibleOrgIds.length) return json({ error: 'You do not have access to this organisation.' }, 403);

    const rows = [];
    for (const orgId of visibleOrgIds) {
      const role = membershipFor(auth.user, orgId)?.role;
      if (role === 'admin' || role === 'senco') {
        const query = `SELECT student_id, organization_id, display_name, external_ref, year_group, status, created_at, updated_at
          FROM pathways_students WHERE organization_id = ? ${includeInactive ? '' : "AND status = 'active'"}
          ORDER BY display_name COLLATE NOCASE`;
        const found = await auth.db.prepare(query).bind(orgId).all();
        rows.push(...(found?.results || []));
      } else {
        const query = `SELECT s.student_id, s.organization_id, s.display_name, s.external_ref, s.year_group,
            s.status, s.created_at, s.updated_at, a.permission
          FROM pathways_student_assignments a
          JOIN pathways_students s ON s.student_id = a.student_id
          WHERE a.user_id = ? AND s.organization_id = ? ${includeInactive ? '' : "AND s.status = 'active'"}
          ORDER BY s.display_name COLLATE NOCASE`;
        const found = await auth.db.prepare(query).bind(auth.user.id, orgId).all();
        rows.push(...(found?.results || []));
      }
    }
    result = { results: rows };
  }
  return json({ students: result?.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 256 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const organizationId = String(payload.organizationId || '');
  if (!canCreate(auth, organizationId)) return json({ error: 'You do not have permission to create student workspaces.' }, 403);
  const organization = await auth.db.prepare('SELECT organization_id FROM pathways_organizations WHERE organization_id = ? AND status = ?')
    .bind(organizationId, 'active').first();
  if (!organization) return json({ error: 'Organisation was not found.' }, 404);

  const displayName = String(payload.displayName || '').trim();
  const externalRef = String(payload.externalRef || '').trim();
  const yearGroup = String(payload.yearGroup || '').trim();
  if (displayName.length < 1 || displayName.length > 120 || externalRef.length > 120 || yearGroup.length > 80) {
    return json({ error: 'Student details are invalid.' }, 400);
  }
  const initialState = payload.state || createEmptyPathwaysState();
  try { assertValidPathwaysState(initialState); } catch (error) { return json({ error: String(error?.message || 'Initial state is invalid.') }, 400); }

  const studentId = `stu-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  try {
    await auth.db.prepare(`INSERT INTO pathways_students
      (student_id, organization_id, display_name, external_ref, year_group, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`)
      .bind(studentId, organizationId, displayName, externalRef || null, yearGroup || null, now, now)
      .run();
    const student = { student_id: studentId, organization_id: organizationId, display_name: displayName };
    const stateRecord = await createStudentState({ db: auth.db, student, actorUserId: auth.user.id, state: initialState });
    await audit(auth.db, {
      organizationId,
      studentId,
      actorUserId: auth.user.id,
      action: 'create',
      entityType: 'student',
      entityId: studentId,
      metadata: null,
    });
    return json({ student: { ...student, external_ref: externalRef || null, year_group: yearGroup || null, status: 'active', created_at: now, updated_at: now }, state: stateRecord }, 201);
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways student creation failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Student workspace could not be created.' }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 32 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const studentId = String(payload.studentId || '');
  const access = await getStudentAccess(auth, studentId, { write: true });
  if (!access.ok) return json({ error: access.error }, access.status);
  if (!auth.user.platformAdmin && !['admin','senco'].includes(access.role)) return json({ error: 'You do not have permission to edit student profile details.' }, 403);

  const displayName = payload.displayName === undefined ? access.student.display_name : String(payload.displayName).trim();
  const externalRef = payload.externalRef === undefined ? (access.student.external_ref || '') : String(payload.externalRef).trim();
  const yearGroup = payload.yearGroup === undefined ? (access.student.year_group || '') : String(payload.yearGroup).trim();
  const status = payload.status === undefined ? access.student.status : String(payload.status);
  if (displayName.length < 1 || displayName.length > 120 || externalRef.length > 120 || yearGroup.length > 80 || !['active','inactive','archived'].includes(status)) {
    return json({ error: 'Student details are invalid.' }, 400);
  }
  const now = new Date().toISOString();
  try {
    await auth.db.prepare(`UPDATE pathways_students SET display_name = ?, external_ref = ?, year_group = ?,
        status = ?, updated_at = ?, archived_at = ? WHERE student_id = ?`)
      .bind(displayName, externalRef || null, yearGroup || null, status, now, status === 'archived' ? now : null, studentId)
      .run();
    await audit(auth.db, {
      organizationId: access.student.organization_id,
      studentId,
      actorUserId: auth.user.id,
      action: status === 'archived' ? 'archive' : 'update',
      entityType: 'student',
      entityId: studentId,
      metadata: { status },
    });
    return json({ ok: true, student: { student_id: studentId, organization_id: access.student.organization_id, display_name: displayName, external_ref: externalRef || null, year_group: yearGroup || null, status, updated_at: now } });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways student update failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Student workspace could not be updated.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'PATCH') return onRequestPatch(context);
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH' });
}
