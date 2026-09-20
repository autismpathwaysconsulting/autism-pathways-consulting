import {
  audit,
  getPathwaysDb,
  issueSession,
  json,
  readJson,
  sessionCookie,
  verifyLogin,
} from '../../lib/pathways/auth.js';

const GENERIC_LOGIN_ERROR = 'Email or password was not accepted.';

async function activeMemberships(db, userId) {
  const result = await db.prepare(`SELECT m.membership_id, m.organization_id, m.role
    FROM pathways_memberships m
    JOIN pathways_organizations o ON o.organization_id = m.organization_id
    WHERE m.user_id = ? AND m.is_active = 1 AND o.status = 'active'
    ORDER BY m.organization_id`)
    .bind(userId)
    .all();
  return result?.results || [];
}

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
    // Keep external responses account-agnostic. Lockout state is enforced internally,
    // but callers cannot distinguish an unknown account from an existing locked one.
    if (!result.ok) return json({ error: GENERIC_LOGIN_ERROR }, 401);

    const session = await issueSession(db, result.user.id, result.credentialHash);
    if (!session) return json({ error: GENERIC_LOGIN_ERROR }, 401);

    const memberships = await activeMemberships(db, result.user.id);
    await audit(db, {
      actorUserId: result.user.id,
      action: 'login',
      entityType: 'session',
      entityId: result.user.id,
    });
    return json({
      ok: true,
      user: { ...result.user, memberships },
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
