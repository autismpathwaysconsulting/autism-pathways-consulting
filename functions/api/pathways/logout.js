import {
  authenticate,
  audit,
  clearSessionCookie,
  json,
  requireWriteRequest,
  revokeSession,
} from '../../lib/pathways/auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status, { 'Set-Cookie': clearSessionCookie() });
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return new Response(writeFailure.body, {
    status: writeFailure.status,
    headers: new Headers([...writeFailure.headers, ['Set-Cookie', clearSessionCookie()]]),
  });

  let revoked = false;
  try {
    await revokeSession(auth.db, request);
    revoked = true;
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways session revocation failed during logout', errorType: String(error?.name || 'Error') }));
  }

  try {
    await audit(auth.db, {
      actorUserId: auth.user.id,
      action: revoked ? 'logout' : 'logout-revocation-failed',
      entityType: 'session',
      entityId: auth.user.id,
    });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways logout audit failed', errorType: String(error?.name || 'Error') }));
  }

  return json(
    revoked ? { ok: true } : { error: 'The browser was signed out, but server-side session revocation could not be confirmed.' },
    revoked ? 200 : 503,
    { 'Set-Cookie': clearSessionCookie() },
  );
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
