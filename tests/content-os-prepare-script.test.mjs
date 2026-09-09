import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const app = await readFile(new URL('../content-os/episodes/app.js', import.meta.url), 'utf8');

test('navigation labels match section headings and current-page CSS is present', async () => {
  const html = await readFile(new URL('../content-os/episodes/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../content-os/app.css', import.meta.url), 'utf8');
  const nav = html.slice(html.indexOf('<nav class="section-nav"'), html.indexOf('</nav>'));
  const links = [...nav.matchAll(/href="#([\w-]+)">([^<]+)<\/a>/g)];
  assert.equal(links.length, 7);
  for (const [, id, title] of links) assert.ok(html.includes(`id="${id}-title">${title}</h2>`), id);
  assert.match(css, /a\[aria-current="page"\]/);
  assert.match(html, /id="currentSectionLabel"/);
});

test('draft HTML download is labelled and never approves the episode', async () => {
  const code = app.slice(app.indexOf('function downloadScriptHtml('), app.indexOf('function renderResults('));
  for (const status of ['APPROVED', 'SCRIPT_LOCKED']) {
    let downloadedBlob;
    const anchor = { click() {}, remove() {} };
    const context = {
      episodeById: () => ({id:'EP05',status}), activePackArtifact: () => ({version:2}),
      standalonePackHtml: () => '<body><h2>Locked spoken script</h2>Exact saved words</body>',
      Blob, URL: { createObjectURL(blob) { downloadedBlob=blob; return 'blob:test'; }, revokeObjectURL() {} },
      document: { createElement: () => anchor, body: { appendChild() {} } }, setTimeout() {},
    };
    runInNewContext(code+'\ndownloadScriptHtml("EP05");', context);
    const html = await downloadedBlob.text();
    assert.match(html, /Exact saved words/);
    assert.equal(anchor.download, `EP05_${status==='APPROVED'?'draft':'final'}_production_pack_v2.html`);
    if (status==='APPROVED') { assert.match(html, /DRAFT · NOT APPROVED/); assert.doesNotMatch(html, /Locked spoken script/); }
    else assert.doesNotMatch(html, /DRAFT/);
  }
});

test('Prepare shows exact script before approval and never offers approval for missing, failed or locked packs', () => {
  const code = app.slice(app.indexOf('function renderPrepareScript('), app.indexOf('function renderFilmingPackSwitcher('));
  for (const state of ['missing', 'draft', 'pass', 'fail', 'SCRIPT_LOCKED', 'FILMED', 'PUBLISHED']) {
    const children = [];
    const script = 'Exact saved words. <script>Never HTML</script>';
    const artifact = ['missing', 'draft'].includes(state) ? null : { version: 3, payload: { spokenScript: script, redteam: { result: state === 'fail' ? 'FAIL' : 'PASS', score: 9 } } };
    const context = {
      element: () => ({ appendChild: node => children.push(node) }), clear() {},
      episodeById: () => ({ id: 'EP01', title: 'Test', status: ['SCRIPT_LOCKED', 'FILMED', 'PUBLISHED'].includes(state) ? state : 'APPROVED' }),
      activePackArtifact: () => artifact, latestPrompt: () => ({ preferredScript: state === 'draft' ? 'My unaudited words' : '' }),
      activePromptArtifact: () => ({payload_sha256:'test'}), readScriptRecovery: () => null,
      episodeLabel: () => 'Episode 1', packPasses: () => state === 'pass',
      node: (tag, css, text) => ({ tag, text, dataset: {} }),
      appendPackSection: (target, title, value) => children.push({ title, text: value }), appendScriptEditor() {},
    };
    runInNewContext(code + '\nrenderPrepareScript("EP01");', context);
    const approvals = children.filter(item => item.dataset?.lockEpisode);
    assert.equal(approvals.length, state === 'pass' ? 1 : 0, state);
    if (artifact) assert.ok(children.some(item => item.text === script));
    if (state === 'missing') assert.ok(children.some(item => /No script has been generated/.test(item.text)));
    if (state === 'draft') assert.ok(children.some(item => item.text === 'My unaudited words'));
    if (state === 'pass') assert.ok(children.findIndex(item => item.text === script) < children.indexOf(approvals[0]));
  }
});

test('import returns to Prepare without locking; compact output avoids duplicate prose', async () => {
  const code = app.slice(app.indexOf('async function importPackage()'), app.indexOf('async function pasteAndImportPackage()'));
  const calls = [];
  const context = {
    element: id => ({ value: id === 'importEpisode' ? 'EP01' : '{}' }),
    parseImportedJson: JSON.parse, setImportFeedback() {}, setStatus() {}, uniqueKey: () => 'test',
    apiRequest: async payload => calls.push(payload.action),
    selectStudioEpisode: id => calls.push(id), goToStudioStage: stage => calls.push(stage),
  };
  await runInNewContext(code + '\nimportPackage();', context);
  assert.deepEqual(calls, ['import_production_pack', 'EP01', 'pack']);
  assert.match(app, /Return exactly one fenced JSON package/);
  assert.match(app, /JSON\.stringify\(example\)/);
  assert.doesNotMatch(app, /After the readable/);
  assert.match(app, /Never omit required checks to save tokens/);
});
