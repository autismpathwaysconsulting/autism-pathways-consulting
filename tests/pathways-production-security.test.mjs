import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production Pathways source and checked-in browser artifacts remain identical', async () => {
  for (const file of ['index.html','app.css','app.js','model.js','schema.js','account.html','account.js']) {
    assert.equal(await read(`pathways/${file}`), await read(`dist/pathways/${file}`), `${file} source/dist drift`);
  }
});

test('founder bootstrap is one atomic D1 batch with an atomic one-time sentinel', async () => {
  const [source, migration] = await Promise.all([
    read('functions/api/pathways/bootstrap.js'),
    read('migrations/0012_pathways_production_beta.sql'),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pathways_platform_state/);
  assert.match(source, /INSERT INTO pathways_platform_state/);
  assert.match(source, /const statements = \[/);
  assert.match(source, /INSERT INTO pathways_student_state/);
  assert.match(source, /INSERT INTO pathways_audit_log/);
  assert.match(source, /await db\.batch\(statements\)/);
  assert.doesNotMatch(source, /createStudentState/);
  assert.match(source, /Organisation timezone is invalid/);
});

test('authentication excludes memberships for suspended or archived organisations', async () => {
  const source = await read('functions/lib/pathways/auth.js');
  assert.match(source, /JOIN pathways_organizations o ON o\.organization_id = m\.organization_id/);
  assert.match(source, /o\.status = 'active'/);
});

test('login session issuance is bound to the exact password hash that was verified', async () => {
  const [auth, login] = await Promise.all([
    read('functions/lib/pathways/auth.js'),
    read('functions/api/pathways/login.js'),
  ]);
  assert.match(auth, /issueSession\(db, userId, expectedPasswordHash = null\)/);
  assert.match(auth, /password_hash = \?/);
  assert.match(auth, /credentialHash: row\.password_hash/);
  assert.match(login, /issueSession\(db, result\.user\.id, result\.credentialHash\)/);
  assert.match(login, /credentials changed during sign-in/i);
});

test('failed-login accounting increments atomically against the credential version checked', async () => {
  const auth = await read('functions/lib/pathways/auth.js');
  assert.match(auth, /failed_login_count = CASE\s+WHEN failed_login_count \+ 1 >= \?/);
  assert.match(auth, /password_hash = \?/);
  assert.match(auth, /locked_until = CASE/);
  assert.doesNotMatch(auth, /const failures = Number\(row\.failed_login_count/);
});

test('frontline consent reads are data-minimised while admin roles can view authority details', async () => {
  const source = await read('functions/api/pathways/consents.js');
  assert.match(source, /canViewDetails/);
  assert.match(source, /\['admin','senco'\]\.includes\(access\.role\)/);
  assert.match(source, /SELECT consent_id, consent_type, status, granted_at, expires_at, created_at/);
  assert.match(source, /authority_label/);
  assert.match(source, /reference_note/);
});

test('authority record and matching audit commit in one D1 batch', async () => {
  const source = await read('functions/api/pathways/consents.js');
  assert.match(source, /await auth\.db\.batch\(\[/);
  assert.match(source, /INSERT INTO pathways_consents/);
  assert.match(source, /INSERT INTO pathways_audit_log/);
  assert.match(source, /requestId = `consent:/);
  assert.doesNotMatch(source, /await audit\(/);
});

test('AI assistance is opt-in, human-confirmed, and blocked without current use authority', async () => {
  const source = await read('functions/api/pathways/ai-suggest.js');
  assert.match(source, /APC_PATHWAYS_AI_ENABLED/);
  assert.match(source, /hasUseAuthority/);
  assert.match(source, /authorityBlocked:true/);
  assert.match(source, /humanConfirmationRequired:true/);
  assert.match(source, /Never decide an IEP objective result/);
});

test('complete exports are admin-only, include archived records, and do not silently stop at 100 revisions', async () => {
  const source = await read('functions/api/pathways/export.js');
  assert.match(source, /Only an administrator or SENCO can export a complete student record/);
  assert.match(source, /includeArchived: true/);
  assert.match(source, /SELECT revision FROM pathways_state_revisions/);
  assert.match(source, /historyComplete/);
  assert.doesNotMatch(source, /listRevisions\(auth\.db, studentId, 100\)/);
});

test('archived students remain available to privileged lifecycle operations', async () => {
  const [auth, privacy, students] = await Promise.all([
    read('functions/lib/pathways/auth.js'),
    read('functions/api/pathways/privacy.js'),
    read('functions/api/pathways/students.js'),
  ]);
  assert.match(auth, /includeArchived = false/);
  assert.match(privacy, /includeArchived: true/);
  assert.match(students, /includeArchived: true/);
});

test('student creation persists student, canonical state/history and audit atomically', async () => {
  const source = await read('functions/api/pathways/students.js');
  assert.match(source, /await auth\.db\.batch\(\[/);
  assert.match(source, /INSERT INTO pathways_students/);
  assert.match(source, /INSERT INTO pathways_student_state/);
  assert.match(source, /INSERT INTO pathways_audit_log/);
  assert.doesNotMatch(source, /createStudentState/);
});

test('assignment permissions fail closed instead of defaulting unknown values to edit', async () => {
  const source = await read('functions/api/pathways/assignments.js');
  assert.match(source, /permission === 'read' \? 'read' : parsed\.value\.permission === 'edit' \? 'edit' : null/);
  assert.match(source, /Assignment permission is invalid/);
});

test('authority refusal is distinct from concurrency conflict and respects effective date', async () => {
  const source = await read('functions/api/pathways/state.js');
  assert.match(source, /authorityBlocked: true \}, 403/);
  assert.match(source, /result\.conflict \? 409 : 200/);
  assert.match(source, /c\.granted_at/);
  assert.match(source, /dateHasStarted\(row\.granted_at, now, row\.timezone\)/);
  assert.match(source, /dateHasNotExpired\(row\.expires_at, now, row\.timezone\)/);
});

test('self-service password change is bound to the verified credential and revokes sessions atomically', async () => {
  const source = await read('functions/api/pathways/password.js');
  assert.match(source, /verifyLogin\(auth\.db, auth\.user\.email, currentPassword\)/);
  assert.match(source, /WHERE user_id = \? AND password_hash = \?/);
  assert.match(source, /verified\.credentialHash/);
  assert.match(source, /await auth\.db\.batch\(\[/);
  assert.match(source, /DELETE FROM pathways_sessions/);
  assert.match(source, /password_hash = \?\s*\n\s*\)/);
  assert.match(source, /changed !== 1/);
  assert.match(source, /clearSessionCookie\(\)/);
  const account = await read('pathways/account.js');
  assert.match(account, /X-Pathways-CSRF/);
  assert.match(account, /\/api\/pathways\/password/);
});

test('meeting frontend has keyboard focus, mobile target sizing, no indexing and accessible close controls', async () => {
  const [html, css, app, account] = await Promise.all([read('pathways/index.html'), read('pathways/app.css'), read('pathways/app.js'), read('pathways/account.html')]);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(account, /noindex,nofollow,noarchive/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(html, /aria-label="Close"/);
  assert.doesNotMatch(app, /\blocalStorage\b/);
});

test('browser and server authority displays both apply effective/latest-record semantics and UI captures dates', async () => {
  const [html, app, state] = await Promise.all([
    read('pathways/index.html'),
    read('pathways/app.js'),
    read('functions/api/pathways/state.js'),
  ]);
  assert.match(app, /sort\(\(a,b\)=>String\(b\.created_at/);
  assert.match(app, /const latest=applicable\[0\]/);
  assert.match(app, /granted_at/);
  assert.match(state, /ORDER BY c\.created_at DESC, c\.consent_id DESC/);
  assert.match(state, /dateHasStarted\(row\.granted_at/);
  assert.match(state, /dateHasNotExpired\(row\.expires_at/);
  assert.match(html, /id="consentGrantedAt"/);
  assert.match(html, /id="consentExpiresAt"/);
  assert.match(app, /grantedAt:\$\('consentGrantedAt'\)\.value/);
  assert.match(app, /expiresAt:\$\('consentExpiresAt'\)\.value/);
});

test('administration manages inactive and archived students separately from the active daily selector', async () => {
  const app = await read('pathways/app.js');
  assert.match(app, /includeInactive=1/);
  assert.match(app, /\/api\/pathways\/students/);
  assert.match(app, /method:'PATCH'/);
  assert.match(app, /status/);
  assert.match(app, /archived/i);
});
