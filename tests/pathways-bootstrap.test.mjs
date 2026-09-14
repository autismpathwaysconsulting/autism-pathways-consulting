import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../pathways-lab/app.js', import.meta.url), 'utf8');

function createElement(tagName) {
  return {
    tagName,
    src: '',
    onload: null,
    onerror: null,
    style: {},
    className: '',
    innerHTML: '',
    textContent: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    append() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

test('Pathways initial bootstrap loads core, model and fixes before calm UI without a subject form', async () => {
  const loaded = [];
  const errors = [];
  let renderCount = 0;

  const sandbox = {
    Promise,
    Set,
    Error,
    console: {
      log() {},
      warn() {},
      error(...args) { errors.push(args.map(String).join(' ')); },
    },
    requestAnimationFrame(callback) { callback(); },
    MutationObserver: class {
      constructor() {}
      observe() {}
      disconnect() {}
    },
    document: {
      getElementById() { return null; },
      createElement,
      head: {
        appendChild(node) {
          if (!node.src) return node;
          loaded.push(node.src);
          if (node.src.endsWith('/app-core.js')) {
            sandbox.renderSubjectForm = () => {};
            sandbox.renderAll = () => { renderCount += 1; };
            // Deliberately do not provide formData or renderTasks here. The
            // bootstrap must remain safe before any subject has been opened.
          } else if (node.src.endsWith('/model.js')) {
            sandbox.PathwaysModel = Object.freeze({ loaded: true });
          } else if (node.src.endsWith('/app-fixes.js')) {
            sandbox.pathwaysFixesLoaded = true;
          }
          queueMicrotask(() => node.onload?.());
          return node;
        },
      },
    },
  };

  vm.runInNewContext(appSource, sandbox, { filename: 'pathways-lab/app.js' });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(loaded, [
    '/pathways-lab/app-core.js',
    '/pathways-lab/model.js',
    '/pathways-lab/app-fixes.js',
  ]);
  assert.equal(sandbox.PathwaysModel.loaded, true);
  assert.equal(sandbox.pathwaysFixesLoaded, true);
  assert.equal(renderCount, 1);
  assert.deepEqual(errors, []);
});

test('checked-in Pathways Pages assets exactly match their source files', async () => {
  for (const relativePath of [
    'pathways-lab/index.html',
    'pathways-lab/app-core.js',
    'pathways-lab/app.js',
    'pathways-lab/model.js',
    'pathways-lab/app-fixes.js',
  ]) {
    const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    const deployed = await readFile(new URL(`../dist/${relativePath}`, import.meta.url), 'utf8');
    assert.equal(deployed, source, `dist/${relativePath} must match ${relativePath}`);
  }
});
