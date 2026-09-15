import {
  authenticate,
  audit,
  clearSessionCookie,
  getPathwaysDb,
  json,
  requireWriteRequest,
  revokeSession,
} from '../../lib/pathways/auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  try {
    await audit(auth.db, {
      actorUserId: auth.user.id,
      action: 'logout',
      entityType: 'session',
      entityId: auth.user.id,
    });
    await revokeSession(auth.db, request);
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways logout failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Sign-out is temporarily unavailable.' }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
