import {
  authenticate,
  audit,
  getStudentAccess,
  json,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';

const TYPES = ['pilot-use','school-record','family-sharing','research-secondary-use'];
const STATUSES = ['granted','declined','withdrawn','expired','not-required'];

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const studentId = new URL(request.url).searchParams.get('studentId') || '';
  const access = await getStudentAccess(auth, studentId, { write: false });
  if (!access.ok) return json({ error: access.error }, access.status);
  const result = await auth.db.prepare(`SELECT consent_id, consent_type, status, authority_label,
      reference_note, granted_at, expires_at, created_by, created_at, updated_at
    FROM pathways_consents WHERE student_id = ? ORDER BY created_at DESC`)
    .bind(studentId).all();
  return json({ consents: result?.results || [] });
}

export async function onRequestPost({ request, env }) {
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
  if (!auth.user.platformAdmin && !['admin','senco'].includes(access.role)) return json({ error: 'Only an administrator or SENCO can record consent status.' }, 403);
  const type = String(payload.consentType || '');
  const status = String(payload.status || '');
  const authorityLabel = String(payload.authorityLabel || '').trim();
  const referenceNote = String(payload.referenceNote || '').trim();
  const grantedAt = payload.grantedAt ? String(payload.grantedAt) : null;
  const expiresAt = payload.expiresAt ? String(payload.expiresAt) : null;
  if (!TYPES.includes(type) || !STATUSES.includes(status) || authorityLabel.length > 240 || referenceNote.length > 1200) {
    return json({ error: 'Consent details are invalid.' }, 400);
  }
  const dateLike = value => value === null || /^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value);
  if (!dateLike(grantedAt) || !dateLike(expiresAt)) return json({ error: 'Consent dates are invalid.' }, 400);

  const id = `con-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  try {
    await auth.db.prepare(`INSERT INTO pathways_consents
      (consent_id, organization_id, student_id, consent_type, status, authority_label,
       reference_note, granted_at, expires_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        access.student.organization_id,
        studentId,
        type,
        status,
        authorityLabel || null,
        referenceNote || null,
        grantedAt,
        expiresAt,
        auth.user.id,
        now,
        now,
      ).run();
    await audit(auth.db, {
      organizationId: access.student.organization_id,
      studentId,
      actorUserId: auth.user.id,
      action: 'record-consent',
      entityType: 'consent',
      entityId: id,
      metadata: { consentType: type, status },
    });
    return json({ consent: { consent_id: id, consent_type: type, status, authority_label: authorityLabel || null, reference_note: referenceNote || null, granted_at: grantedAt, expires_at: expiresAt, created_at: now } }, 201);
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways consent record failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Consent status could not be recorded.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
}
