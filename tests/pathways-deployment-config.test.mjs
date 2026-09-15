import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = path => readFile(new URL(`../${path}`, import.meta.url));
const text = async path => (await file(path)).toString('utf8');

test('Pathways preview alone binds the isolated synthetic D1 and keeps AI disabled', async () => {
  const config = JSON.parse(await text('wrangler.jsonc'));
  const preview = config.env?.preview;
  const production = config.env?.production;
  assert.equal(preview?.vars?.APC_PATHWAYS_AI_ENABLED, 'false');
  const binding = (preview?.d1_databases || []).find(item => item.binding === 'APC_PATHWAYS_DB');
  assert.deepEqual(binding, {
    binding: 'APC_PATHWAYS_DB',
    database_name: 'apc-client-pathway-preview-synthetic',
    database_id: '16329f9f-f191-4279-96f5-b60cee420dae',
    migrations_dir: 'pathways-migrations',
  });
  const productionJson = JSON.stringify(production || {});
  assert.doesNotMatch(productionJson, /apc-client-pathway-preview-synthetic/);
  assert.doesNotMatch(productionJson, /16329f9f-f191-4279-96f5-b60cee420dae/);
  assert.ok(!(production?.d1_databases || []).some(item => item.binding === 'APC_PATHWAYS_DB'), 'production must not inherit the synthetic preview binding');
});

test('Pathways staged migrations remain byte-identical to canonical migrations', async () => {
  const pairs = [
    ['migrations/0012_pathways_production_beta.sql','pathways-migrations/0001_pathways_production_beta.sql'],
    ['migrations/0013_pathways_privacy_erasure.sql','pathways-migrations/0002_pathways_privacy_erasure.sql'],
    ['migrations/0014_pathways_synthetic_provenance.sql','pathways-migrations/0003_pathways_synthetic_provenance.sql'],
  ];
  for (const [canonical, staged] of pairs) {
    const [a,b] = await Promise.all([file(canonical),file(staged)]);
    assert.equal(Buffer.compare(a,b), 0, `${staged} drifted from ${canonical}`);
  }
});
