const SESSION_COOKIE = '__Host-pathways_session';
const SESSION_SECONDS = 12 * 60 * 60;
const PASSWORD_ITERATIONS = 160000;
const DUMMY_PASSWORD_SALT = '00000000000000000000000000000000';
const DUMMY_PASSWORD_HASH = '0'.repeat(64);
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export function getPathwaysDb(env) {
  return env.APC_PATHWAYS_DB || env.APC_CONTENT_OS_DB || null;
}

export function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...headers,
    },
  });
}

export function methodNotAllowed(allowed) {
  return json({ error: 'Method not allowed.' }, 405, { Allow: allowed.join(', ') });
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) throw new TypeError('Invalid hexadecimal value.');
  return Uint8Array.from(hex.match(/.{2}/g), pair => Number.parseInt(pair, 16));
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validatePassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

export async function derivePasswordHash(password, saltHex, iterations = PASSWORD_ITERATIONS) {
  if (!validatePassword(password)) throw new TypeError('Password must be 12 to 128 characters.');
  if (!Number.isSafeInteger(iterations) || iterations < 100000 || iterations > 500000) throw new TypeError('Password iteration count is invalid.');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function createPasswordRecord(password) {
  if (!validatePassword(password)) throw new TypeError('Password must be 12 to 128 characters.');
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const passwordSalt = bytesToHex(salt);
  const passwordHash = await derivePasswordHash(password, passwordSalt, PASSWORD_ITERATIONS);
  return { passwordSalt, passwordHash, passwordIterations: PASSWORD_ITERATIONS };
}

async function constantTimeEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const [a, b] = await Promise.all([sha256Hex(actual), sha256Hex(expected)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function parseCookie(cookieHeader, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookieHeader || '');
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}

export async function issueSession(db, userId, expectedPasswordHash = null) {
  const token = randomToken(32);
  const sessionHash = await sha256Hex(token);
  const csrfToken = randomToken(24);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  let result;
  if (expectedPasswordHash) {
    result = await db.prepare(`INSERT INTO pathways_sessions
      (session_hash, user_id, csrf_token, created_at, expires_at, last_seen_at)
      SELECT ?, user_id, ?, ?, ?, ? FROM pathways_users
      WHERE user_id = ? AND password_hash = ? AND is_active = 1`)
      .bind(sessionHash, csrfToken, createdAt, expiresAt, createdAt, userId, expectedPasswordHash)
      .run();
    const changes = Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
    if (changes !== 1) return null;
  } else {
    await db.prepare(`INSERT INTO pathways_sessions
      (session_hash, user_id, csrf_token, created_at, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(sessionHash, userId, csrfToken, createdAt, expiresAt, createdAt)
      .run();
  }
  return { token, csrfToken, expiresAt };
}

export async function revokeSession(db, request) {
  const token = parseCookie(request.headers.get('Cookie'), SESSION_COOKIE);
  if (!token) return;
  const sessionHash = await sha256Hex(token);
  await db.prepare('DELETE FROM pathways_sessions WHERE session_hash = ?').bind(sessionHash).run();
}

export async function authenticate(request, env) {
  const db = getPathwaysDb(env);
  if (!db) return { ok: false, status: 503, error: 'Pathways storage is not configured.' };
  const token = parseCookie(request.headers.get('Cookie'), SESSION_COOKIE);
  if (!token) return { ok: false, status: 401, error: 'Authentication required.' };
  const sessionHash = await sha256Hex(token);
  const row = await db.prepare(`SELECT
      s.session_hash, s.csrf_token, s.expires_at, s.last_seen_at,
      u.user_id, u.email, u.display_name, u.is_platform_admin, u.is_active
    FROM pathways_sessions s
    JOIN pathways_users u ON u.user_id = s.user_id
    WHERE s.session_hash = ?`)
    .bind(sessionHash)
    .first();
  if (!row || row.is_active !== 1 || Date.parse(row.expires_at) <= Date.now()) {
    if (row) await db.prepare('DELETE FROM pathways_sessions WHERE session_hash = ?').bind(sessionHash).run();
    return { ok: false, status: 401, error: 'Session expired. Please sign in again.' };
  }

  const membershipsResult = await db.prepare(`SELECT m.membership_id, m.organization_id, m.role
    FROM pathways_memberships m
    JOIN pathways_organizations o ON o.organization_id = m.organization_id
    WHERE m.user_id = ? AND m.is_active = 1 AND o.status = 'active'`)
    .bind(row.user_id)
    .all();
  const memberships = membershipsResult?.results || [];

  const now = new Date().toISOString();
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 5 * 60 * 1000) {
    await db.prepare('UPDATE pathways_sessions SET last_seen_at = ? WHERE session_hash = ?')
      .bind(now, sessionHash)
      .run();
  }

  return {
    ok: true,
    db,
    sessionHash,
    csrfToken: row.csrf_token,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      platformAdmin: row.is_platform_admin === 1,
      memberships,
    },
  };
}

export function requireWriteRequest(request, auth) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (!origin || origin !== url.origin) return json({ error: 'Cross-origin writes are not allowed.' }, 403);
  if (request.headers.get('X-Pathways-Request') !== '1') return json({ error: 'Missing Pathways request header.' }, 400);
  if (!auth?.csrfToken || request.headers.get('X-Pathways-CSRF') !== auth.csrfToken) return json({ error: 'CSRF validation failed.' }, 403);
  return null;
}

export async function readJson(request, { maxBytes = 256 * 1024 } = {}) {
  const type = (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/json') return { ok: false, response: json({ error: 'Content-Type must be application/json.' }, 415) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, response: json({ error: 'Request body is too large.' }, 413) };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object');
    return { ok: true, value };
  } catch {
    return { ok: false, response: json({ error: 'Request body is not valid JSON.' }, 400) };
  }
}

export async function verifyLogin(db, email, password) {
  const normalized = validateEmail(email);
  if (!normalized || typeof password !== 'string') return { ok: false, generic: true };
  const row = await db.prepare(`SELECT user_id, email, display_name, password_salt, password_hash,
      password_iterations, is_platform_admin, is_active, failed_login_count, locked_until
    FROM pathways_users WHERE email = ? COLLATE NOCASE`)
    .bind(normalized)
    .first();
  // Every account-state path pays for one password derivation before rejection.
  // Fixed dummy material is not a credential and can never authenticate a user.
  const usableRecord = row && /^[a-f0-9]{32}$/i.test(row.password_salt)
    && /^[a-f0-9]{64}$/i.test(row.password_hash)
    && Number.isSafeInteger(row.password_iterations)
    && row.password_iterations >= 100000 && row.password_iterations <= 500000;
  const candidate = await derivePasswordHash(
    validatePassword(password) ? password : 'invalid-password-placeholder',
    usableRecord ? row.password_salt : DUMMY_PASSWORD_SALT,
    usableRecord ? row.password_iterations : PASSWORD_ITERATIONS,
  );
  const matches = await constantTimeEqual(candidate, usableRecord ? row.password_hash : DUMMY_PASSWORD_HASH);
  if (!row || row.is_active !== 1 || !usableRecord) return { ok: false, generic: true };
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) return { ok: false, locked: true, generic: true };
  const valid = validatePassword(password) && matches;
  const now = new Date().toISOString();
  if (!valid) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    await db.prepare(`UPDATE pathways_users
      SET failed_login_count = CASE
            WHEN failed_login_count + 1 >= ? THEN 0
            ELSE failed_login_count + 1
          END,
          locked_until = CASE
            WHEN failed_login_count + 1 >= ? THEN ?
            ELSE locked_until
          END,
          updated_at = ?
      WHERE user_id = ? AND password_hash = ?
        AND (locked_until IS NULL OR locked_until <= ?)`)
      .bind(MAX_FAILED_LOGINS, MAX_FAILED_LOGINS, lockedUntil, now, row.user_id, row.password_hash, now)
      .run();
    const current = await db.prepare('SELECT locked_until FROM pathways_users WHERE user_id = ?')
      .bind(row.user_id)
      .first();
    const locked = Boolean(current?.locked_until && Date.parse(current.locked_until) > Date.now());
    return { ok: false, locked, generic: true };
  }

  await db.prepare(`UPDATE pathways_users
    SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
    WHERE user_id = ? AND password_hash = ?`)
    .bind(now, now, row.user_id, row.password_hash)
    .run();
  return {
    ok: true,
    credentialHash: row.password_hash,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      platformAdmin: row.is_platform_admin === 1,
    },
  };
}

export function membershipFor(user, organizationId) {
  return user.memberships.find(item => item.organization_id === organizationId) || null;
}

export async function getStudentAccess(auth, studentId, { write = false, includeArchived = false } = {}) {
  const student = await auth.db.prepare(`SELECT student_id, organization_id, display_name, external_ref,
      year_group, status, is_synthetic_demo, created_at, updated_at
    FROM pathways_students WHERE student_id = ?`)
    .bind(studentId)
    .first();
  if (!student || (student.status === 'archived' && !includeArchived)) return { ok: false, status: 404, error: 'Student record was not found.' };
  if (auth.user.platformAdmin) return { ok: true, student, permission: 'edit', role: 'platform-admin' };

  const membership = membershipFor(auth.user, student.organization_id);
  if (!membership) return { ok: false, status: 403, error: 'You do not have access to this organisation.' };
  const lifecyclePrivilege = includeArchived && (membership.role === 'admin' || membership.role === 'senco');
  if (student.status !== 'active' && !lifecyclePrivilege) {
    return { ok: false, status: 404, error: 'Student record was not found.' };
  }
  if (membership.role === 'admin' || membership.role === 'senco') {
    return { ok: true, student, permission: 'edit', role: membership.role };
  }

  const assignment = await auth.db.prepare(`SELECT permission FROM pathways_student_assignments
    WHERE student_id = ? AND user_id = ?`)
    .bind(studentId, auth.user.id)
    .first();
  if (!assignment) return { ok: false, status: 403, error: 'You are not assigned to this student.' };
  if (write && (membership.role === 'viewer' || assignment.permission !== 'edit')) {
    return { ok: false, status: 403, error: 'This student record is read-only for your account.' };
  }
  return { ok: true, student, permission: assignment.permission, role: membership.role };
}

export async function audit(db, {
  organizationId = null,
  studentId = null,
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  metadata = null,
}) {
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO pathways_audit_log
    (organization_id, student_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      organizationId,
      studentId,
      actorUserId,
      String(action),
      String(entityType),
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      createdAt,
    )
    .run();
}

export async function countUsers(db) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM pathways_users').first();
  return Number(row?.count || 0);
}

export { SESSION_COOKIE, SESSION_SECONDS };
