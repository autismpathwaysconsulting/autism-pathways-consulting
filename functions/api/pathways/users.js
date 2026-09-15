import {
  authenticate,
  audit,
  createPasswordRecord,
  json,
  membershipFor,
  normalizeEmail,
  readJson,
  requireWriteRequest,
  validateEmail,
  validatePassword,
} from '../../lib/pathways/auth.js';

const ROLES = ['admin','senco','support','viewer'];

function canManage(auth, organizationId) {
  if (auth.user.platformAdmin) return true;
  return membershipFor(auth.user, organizationId)?.role === 'admin';
}

function canView(auth, organizationId) {
  if (auth.user.platformAdmin) return true;
  const role = membershipFor(auth.user, organizationId)?.role;
  return role === 'admin' || role === 'senco';
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId') || '';
  if (!organizationId || !canView(auth, organizationId)) return json({ error: 'You do not have permission to view organisation users.' }, 403);
  const result = await auth.db.prepare(`SELECT u.user_id, u.email, u.display_name, u.is_active,
      u.last_login_at, m.role, m.is_active AS membership_active, m.created_at
    FROM pathways_memberships m
    JOIN pathways_users u ON u.user_id = m.user_id
    WHERE m.organization_id = ?
    ORDER BY u.display_name COLLATE NOCASE`)
    .bind(organizationId)
    .all();
  return json({ users: result?.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  const parsed = await readJson(request, { maxBytes: 32 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const organizationId = String(payload.organizationId || '');
  if (!canManage(auth, organizationId)) return json({ error: 'You do not have permission to manage organisation users.' }, 403);
  const email = validateEmail(payload.email);
  const displayName = String(payload.displayName || '').trim();
  const role = String(payload.role || 'support');
  if (!email || displayName.length < 2 || displayName.length > 120 || !ROLES.includes(role)) return json({ error: 'User details are invalid.' }, 400);

  const organization = await auth.db.prepare('SELECT organization_id FROM pathways_organizations WHERE organization_id = ? AND status = ?')
    .bind(organizationId, 'active').first();
  if (!organization) return json({ error: 'Organisation was not found.' }, 404);

  const now = new Date().toISOString();
  const normalized = normalizeEmail(email);
  let user = await auth.db.prepare('SELECT user_id, email, display_name, is_active FROM pathways_users WHERE email = ? COLLATE NOCASE')
    .bind(normalized).first();
  let createdUser = false;

  try {
    if (!user) {
      if (!validatePassword(payload.password)) return json({ error: 'A temporary password of 12 to 128 characters is required for a new user.' }, 400);
      const password = await createPasswordRecord(payload.password);
      const userId = `usr-${crypto.randomUUID()}`;
      await auth.db.prepare(`INSERT INTO pathways_users
        (user_id, email, display_name, password_salt, password_hash, password_iterations,
         is_platform_admin, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`)
        .bind(userId, normalized, displayName, password.passwordSalt, password.passwordHash, password.passwordIterations, now, now)
        .run();
      user = { user_id: userId, email: normalized, display_name: displayName, is_active: 1 };
      createdUser = true;
    }

    const existingMembership = await auth.db.prepare(`SELECT membership_id FROM pathways_memberships
      WHERE organization_id = ? AND user_id = ?`)
      .bind(organizationId, user.user_id).first();
    if (existingMembership) return json({ error: 'This user already belongs to the organisation.' }, 409);

    const membershipId = `mem-${crypto.randomUUID()}`;
    await auth.db.prepare(`INSERT INTO pathways_memberships
      (membership_id, organization_id, user_id, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .bind(membershipId, organizationId, user.user_id, role, now, now)
      .run();
    await audit(auth.db, {
      organizationId,
      actorUserId: auth.user.id,
      action: createdUser ? 'create-user' : 'add-membership',
      entityType: 'user',
      entityId: user.user_id,
      metadata: { role },
    });
    return json({
      user: {
        user_id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        role,
        is_active: user.is_active,
      },
    }, 201);
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways user creation failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'User could not be created.' }, 500);
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
  const organizationId = String(payload.organizationId || '');
  const userId = String(payload.userId || '');
  const action = String(payload.action || '');
  if (!canManage(auth, organizationId)) return json({ error: 'You do not have permission to manage organisation users.' }, 403);
  const membership = await auth.db.prepare(`SELECT membership_id, role, is_active FROM pathways_memberships
    WHERE organization_id = ? AND user_id = ?`)
    .bind(organizationId, userId).first();
  if (!membership) return json({ error: 'Membership was not found.' }, 404);
  const now = new Date().toISOString();

  try {
    if (action === 'set-role') {
      const role = String(payload.role || '');
      if (!ROLES.includes(role)) return json({ error: 'Role is invalid.' }, 400);
      await auth.db.prepare('UPDATE pathways_memberships SET role = ?, updated_at = ? WHERE membership_id = ?')
        .bind(role, now, membership.membership_id).run();
      await audit(auth.db, { organizationId, actorUserId: auth.user.id, action: 'set-role', entityType: 'membership', entityId: membership.membership_id, metadata: { role } });
    } else if (action === 'set-active') {
      const active = payload.active === true ? 1 : 0;
      if (userId === auth.user.id && active === 0) return json({ error: 'You cannot deactivate your own membership.' }, 400);
      await auth.db.prepare('UPDATE pathways_memberships SET is_active = ?, updated_at = ? WHERE membership_id = ?')
        .bind(active, now, membership.membership_id).run();
      await audit(auth.db, { organizationId, actorUserId: auth.user.id, action: active ? 'activate-membership' : 'deactivate-membership', entityType: 'membership', entityId: membership.membership_id });
    } else if (action === 'reset-password') {
      if (!auth.user.platformAdmin) {
        return json({ error: 'Organisation administrators cannot reset global user credentials. Use the account recovery flow or a platform administrator.' }, 403);
      }
      if (!validatePassword(payload.password)) return json({ error: 'New password must be 12 to 128 characters.' }, 400);
      const password = await createPasswordRecord(payload.password);
      await auth.db.batch([
        auth.db.prepare(`UPDATE pathways_users SET password_salt = ?, password_hash = ?, password_iterations = ?,
          failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?`)
          .bind(password.passwordSalt, password.passwordHash, password.passwordIterations, now, userId),
        auth.db.prepare('DELETE FROM pathways_sessions WHERE user_id = ?').bind(userId),
      ]);
      await audit(auth.db, { organizationId, actorUserId: auth.user.id, action: 'reset-password', entityType: 'user', entityId: userId });
    } else {
      return json({ error: 'Unsupported user action.' }, 400);
    }
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways user update failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'User could not be updated.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'PATCH') return onRequestPatch(context);
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH' });
}
