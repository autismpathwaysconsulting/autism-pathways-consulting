import {
  audit,
  countUsers,
  createPasswordRecord,
  getPathwaysDb,
  json,
  normalizeEmail,
  readJson,
  sha256Hex,
  validateEmail,
  validatePassword,
} from '../../lib/pathways/auth.js';
import { createStudentState } from '../../lib/pathways/state.js';
import { createSyntheticDemoState } from '../../../pathways/demo-state.js';

function parseBasic(header) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(header || '');
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const colon = decoded.indexOf(':');
    if (colon < 0) return null;
    return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

async function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const [ah, bh] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ah.length; i += 1) diff |= ah.charCodeAt(i) ^ bh.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const db = getPathwaysDb(env);
  if (!db) return json({ error: 'Pathways storage is not configured.' }, 503);
  const existingUsers = await countUsers(db);
  if (existingUsers > 0) return json({ error: 'Pathways has already been bootstrapped.' }, 409);

  const credential = parseBasic(request.headers.get('Authorization'));
  const bootstrapSecret = env.APC_PATHWAYS_BOOTSTRAP_SECRET || env.APC_CONTENT_OS_AUTH;
  if (!credential || credential.username !== 'apc' || !await sameSecret(credential.password, bootstrapSecret)) {
    return json({ error: 'Bootstrap authorization required.' }, 401, { 'WWW-Authenticate': 'Basic realm="Pathways Bootstrap"' });
  }

  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json({ error: 'Cross-origin bootstrap is not allowed.' }, 403);
  if (request.headers.get('X-Pathways-Request') !== '1') return json({ error: 'Missing Pathways request header.' }, 400);

  const parsed = await readJson(request, { maxBytes: 32 * 1024 });
  if (!parsed.ok) return parsed.response;
  const payload = parsed.value;
  const email = validateEmail(payload.email);
  const displayName = String(payload.displayName || '').trim();
  const organizationName = String(payload.organizationName || '').trim();
  const slug = String(payload.organizationSlug || '').trim().toLowerCase();
  if (!email || displayName.length < 2 || displayName.length > 120) return json({ error: 'A valid founder email and display name are required.' }, 400);
  if (!validatePassword(payload.password)) return json({ error: 'Password must be 12 to 128 characters.' }, 400);
  if (organizationName.length < 2 || organizationName.length > 160 || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    return json({ error: 'Organisation name or slug is invalid.' }, 400);
  }

  const now = new Date().toISOString();
  const userId = `usr-${crypto.randomUUID()}`;
  const organizationId = `org-${crypto.randomUUID()}`;
  const membershipId = `mem-${crypto.randomUUID()}`;
  const password = await createPasswordRecord(payload.password);

  try {
    await db.batch([
      db.prepare(`INSERT INTO pathways_organizations
        (organization_id, name, slug, status, timezone, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?)`)
        .bind(organizationId, organizationName, slug, payload.timezone || 'Asia/Kuala_Lumpur', now, now),
      db.prepare(`INSERT INTO pathways_users
        (user_id, email, display_name, password_salt, password_hash, password_iterations,
         is_platform_admin, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
        .bind(userId, normalizeEmail(email), displayName, password.passwordSalt, password.passwordHash, password.passwordIterations, now, now),
      db.prepare(`INSERT INTO pathways_memberships
        (membership_id, organization_id, user_id, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 'admin', 1, ?, ?)`)
        .bind(membershipId, organizationId, userId, now, now),
    ]);

    let demoStudentId = null;
    if (payload.seedDemo !== false) {
      demoStudentId = `stu-${crypto.randomUUID()}`;
      await db.prepare(`INSERT INTO pathways_students
        (student_id, organization_id, display_name, external_ref, year_group, status, created_at, updated_at)
        VALUES (?, ?, 'Student A', 'SYNTHETIC-DEMO', 'Demo', 'active', ?, ?)`)
        .bind(demoStudentId, organizationId, now, now)
        .run();
      await createStudentState({
        db,
        student: { student_id: demoStudentId, organization_id: organizationId },
        actorUserId: userId,
        state: createSyntheticDemoState(),
      });
    }

    await audit(db, {
      organizationId,
      actorUserId: userId,
      action: 'bootstrap',
      entityType: 'platform',
      entityId: organizationId,
      metadata: { demoSeeded: Boolean(demoStudentId) },
    });

    return json({
      ok: true,
      founder: { id: userId, email, displayName },
      organization: { id: organizationId, name: organizationName, slug },
      demoStudentId,
    }, 201);
  } catch (error) {
    console.error(JSON.stringify({ message: 'Pathways bootstrap failed', errorType: String(error?.name || 'Error') }));
    return json({ error: 'Pathways bootstrap failed.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  return onRequestPost(context);
}
