import {
  authenticate,
  audit,
  json,
  readJson,
  requireWriteRequest,
} from '../../lib/pathways/auth.js';

function validSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ? slug : null;
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let rows;
  if (auth.user.platformAdmin) {
    const result = await auth.db.prepare(`SELECT organization_id, name, slug, status, timezone, created_at, updated_at
      FROM pathways_organizations ORDER BY name COLLATE NOCASE`).all();
    rows = (result?.results || []).map(row => ({ ...row, role: 'platform-admin' }));
  } else {
    const result = await auth.db.prepare(`SELECT o.organization_id, o.name, o.slug, o.status, o.timezone,
        o.created_at, o.updated_at, m.role
      FROM pathways_memberships m
      JOIN pathways_organizations o ON o.organization_id = m.organization_id
      WHERE m.user_id = ? AND m.is_active = 1 AND o.status = 'active'
      ORDER BY o.name COLLATE NOCASE`)
      .bind(auth.user.id)
      .all();
    rows = result?.results || [];
  }
  return json({ organizations: rows });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeFailure = requireWriteRequest(request, auth);
  if (writeFailure) return writeFailure;
  if (!auth.user.platformAdmin) return json({ error: 'Only a platform administrator can create organisations.' }, 403);
  const parsed = await readJson(request, { maxBytes: 24 * 1024 });
  if (!parsed.ok) return parsed.response;
  const name = String(parsed.value.name || '').trim();
  const slug = validSlug(parsed.value.slug);
  const timezone = String(parsed.value.timezone || 'Asia/Kuala_Lumpur').trim();
  if (name.length < 2 || name.length > 160 || !slug || timezone.length > 80) return json({ error: 'Organisation details are invalid.' }, 400);
  const id = `org-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  try {
    await auth.db.prepare(`INSERT INTO pathways_organizations
      (organization_id, name, slug, status, timezone, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .bind(id, name, slug, timezone, now, now)
      .run();
    await audit(auth.db, {
      organizationId: id,
      actorUserId: auth.user.id,
      action: 'create',
      entityType: 'organization',
      entityId: id,
    });
    return json({ organization: { organization_id: id, name, slug, status: 'active', timezone, created_at: now, updated_at: now } }, 201);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return json({ error: 'That organisation slug is already in use.' }, 409);
    console.error(JSON.stringify({ message: 'Pathways organisation creation failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Organisation could not be created.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
}
