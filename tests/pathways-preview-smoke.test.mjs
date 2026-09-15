import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Pathways preview smoke runner is synthetic-only and refuses production targets', async () => {
  const source = await read('scripts/pathways-preview-smoke.mjs');
  assert.match(source, /PATHWAYS_BASE_URL/);
  assert.match(source, /\.pages\.dev/);
  assert.match(source, /Production\/custom domains are refused/);
  assert.match(source, /student\.is_synthetic_demo === 1/);
  assert.doesNotMatch(source, /\/api\/pathways\/privacy/);
  assert.doesNotMatch(source, /erase-student/);
  assert.doesNotMatch(source, /method:\s*['"]PATCH['"][\s\S]{0,200}\/api\/pathways\/students/);
});

test('Pathways preview smoke runner restores its temporary state and makes password rotation opt-in', async () => {
  const source = await read('scripts/pathways-preview-smoke.mjs');
  assert.match(source, /Temporary preview smoke check/);
  assert.match(source, /smoke-restore:/);
  assert.match(source, /smoke-finally-restore:/);
  assert.match(source, /finally\s*\{/);
  assert.match(source, /PATHWAYS_ROTATED_PASSWORD/);
  assert.match(source, /if \(rotatedPassword\)/);
});

test('Pathways preview smoke runner does not print credentials, cookies, CSRF tokens or bootstrap secrets', async () => {
  const source = await read('scripts/pathways-preview-smoke.mjs');
  const outputCalls = source.match(/console\.(?:log|error)\([^;]*\);/gs) || [];
  const outputSource = outputCalls.join('\n');
  for (const sensitive of ['PATHWAYS_FOUNDER_PASSWORD','PATHWAYS_BOOTSTRAP_SECRET','activePassword','cookie','csrfToken','bootstrapSecret']) {
    assert.doesNotMatch(outputSource, new RegExp(sensitive), `smoke output references ${sensitive}`);
  }
  assert.match(outputSource, /status:\s*'PASS'/);
});

test('package exposes the guarded Pathways preview smoke command', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  assert.equal(packageJson.scripts['smoke:pathways-preview'], 'node scripts/pathways-preview-smoke.mjs');
});
