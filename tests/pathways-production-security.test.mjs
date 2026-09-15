import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production Pathways source and checked-in browser artifacts remain identical', async () => {
  for (const file of ['index.html','app.css','app.js','model.js','schema.js']) {
    assert.equal(await read(`pathways/${file}`), await read(`dist/pathways/${file}`), `${file} source/dist drift`);
  }
});

test('founder bootstrap is one atomic D1 batch including optional demo state and audit', async () => {
  const source = await read('functions/api/pathways/bootstrap.js');
  assert.match(source, /const statements = \[/);
  assert.match(source, /INSERT INTO pathways_student_state/);
  assert.match(source, /INSERT INTO pathways_audit_log/);
  assert.match(source, /await db\.batch\(statements\)/);
  assert.doesNotMatch(source, /createStudentState/);
  assert.match(source, /Organisation timezone is invalid/);
});

test('frontline consent reads are data-minimised while admin roles can view authority details', async () => {
  const source = await read('functions/api/pathways/consents.js');
  assert.match(source, /canViewDetails/);
  assert.match(source, /\['admin','senco'\]\.includes\(access\.role\)/);
  assert.match(source, /SELECT consent_id, consent_type, status, expires_at, created_at/);
  assert.match(source, /authority_label/);
  assert.match(source, /reference_note/);
});

test('complete exports are restricted server-side to admin or SENCO roles', async () => {
  const source = await read('functions/api/pathways/export.js');
  assert.match(source, /Only an administrator or SENCO can export a complete student record/);
  assert.match(source, /\['admin','senco'\]\.includes\(access\.role\)/);
});

test('assignment permissions fail closed instead of defaulting unknown values to edit', async () => {
  const source = await read('functions/api/pathways/assignments.js');
  assert.match(source, /permission === 'read' \? 'read' : parsed\.value\.permission === 'edit' \? 'edit' : null/);
  assert.match(source, /Assignment permission is invalid/);
});

test('authority refusal is distinct from concurrency conflict', async () => {
  const source = await read('functions/api/pathways/state.js');
  assert.match(source, /authorityBlocked: true \}, 403/);
  assert.match(source, /result\.conflict \? 409 : 200/);
});

test('AI assistance is deployment opt-in and remains human-confirmed', async () => {
  const source = await read('functions/api/pathways/ai-suggest.js');
  assert.match(source, /APC_PATHWAYS_AI_ENABLED/);
  assert.match(source, /humanConfirmationRequired:true/);
  assert.match(source, /Never decide an IEP objective result/);
});

test('meeting frontend has keyboard focus, mobile target sizing, no indexing and accessible close controls', async () => {
  const [html, css, app] = await Promise.all([read('pathways/index.html'), read('pathways/app.css'), read('pathways/app.js')]);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(app, /aria-label=\"Close\"/);
  assert.doesNotMatch(app, /\blocalStorage\b/);
});

test('browser and server authority displays both apply latest-record semantics', async () => {
  const [app, state] = await Promise.all([read('pathways/app.js'), read('functions/api/pathways/state.js')]);
  assert.match(app, /sort\(\(a,b\)=>String\(b\.created_at/);
  assert.match(app, /const latest=applicable\[0\]/);
  assert.match(state, /ORDER BY c\.created_at DESC, c\.consent_id DESC/);
  assert.match(state, /localDateKey\(now, row\.timezone\)/);
});
