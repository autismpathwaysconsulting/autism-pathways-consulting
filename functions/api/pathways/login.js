import {
  audit,
  getPathwaysDb,
  issueSession,
  json,
  readJson,
  sessionCookie,
  verifyLogin,
} from '../../lib/pathways/auth.js';

export async function onRequestPost({ request, env }) {
  const db = getPathwaysDb(env);
  if (!db) return json({ error: 'Pathways storage is not configured.' }, 503);
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json({ error: 'Cross-origin sign-in is not allowed.' }, 403);
  if (request.headers.get('X-Pathways-Request') !== '1') return json({ error: 'Missing Pathways request header.' }, 400);

  const parsed = await readJson(request, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.value;

  try {
    const result = await verifyLogin(db, email, password);
    if (!result.ok) {
      return json({ error: result.locked ? 'Too many attempts. Try again later.' : 'Email or password was not accepted.' }, 401);
    }
    const session = await issueSession(db, result.user.id);
    await audit(db, {
      actorUserId: result.user.id,
      action: 'login',
      entityType: 'session',
      entityId: result.user.id,
    });
    return json({
      ok: true,
      user: result.user,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    }, 200, { 'Set-Cookie': sessionCookie(session.token) });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways login failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Sign-in is temporarily unavailable.' }, 503);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
