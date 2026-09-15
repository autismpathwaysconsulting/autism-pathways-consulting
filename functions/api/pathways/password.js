import {
  authenticate,
  createPasswordRecord,
  clearSessionCookie,
  json,
  readJson,
  requireWriteRequest,
  validatePassword,
  verifyLogin,
} from '../../lib/pathways/auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return parsed.response;

  const currentPassword = String(parsed.value.currentPassword || '');
  const newPassword = String(parsed.value.newPassword || '');
  if (!validatePassword(newPassword)) return json({ error: 'New password must be 12 to 128 characters.' }, 400);
  if (currentPassword === newPassword) return json({ error: 'Choose a new password that is different from the current password.' }, 400);

  const verified = await verifyLogin(auth.db, auth.user.email, currentPassword);
  if (!verified.ok || verified.user?.id !== auth.user.id) {
    return json({ error: verified.locked ? 'Too many attempts. Try again later.' : 'Current password was not accepted.' }, 401);
  }

  const next = await createPasswordRecord(newPassword);
  const now = new Date().toISOString();
  const requestId = `password:${crypto.randomUUID()}`;
  try {
    const results = await auth.db.batch([
      auth.db.prepare(`UPDATE pathways_users
        SET password_salt = ?, password_hash = ?, password_iterations = ?,
            failed_login_count = 0, locked_until = NULL, updated_at = ?
        WHERE user_id = ? AND password_hash = ?`)
        .bind(next.passwordSalt, next.passwordHash, next.passwordIterations, now, auth.user.id, verified.credentialHash),
      auth.db.prepare(`DELETE FROM pathways_sessions
        WHERE user_id = ? AND EXISTS (
          SELECT 1 FROM pathways_users WHERE user_id = ? AND password_hash = ?
        )`)
        .bind(auth.user.id, auth.user.id, next.passwordHash),
      auth.db.prepare(`INSERT INTO pathways_audit_log
        (organization_id, student_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, created_at)
        SELECT NULL, NULL, ?, 'change-password', 'user', ?, ?, NULL, ?
        FROM pathways_users WHERE user_id = ? AND password_hash = ?`)
        .bind(auth.user.id, auth.user.id, requestId, now, auth.user.id, next.passwordHash),
    ]);
    const changed = Number(results?.[0]?.meta?.changes ?? results?.[0]?.meta?.rows_written ?? 0);
    if (changed !== 1) {
      return json({ error: 'Your credentials changed while this request was being processed. Sign in again and retry.' }, 409);
    }
    return json({ ok: true, message: 'Password changed. Sign in again.' }, 200, { 'Set-Cookie': clearSessionCookie() });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways password change failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Password could not be changed.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
