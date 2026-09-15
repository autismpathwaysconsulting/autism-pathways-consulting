import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sources = new Map([
  ['/pathways-lab/app.js', await readFile(new URL('../pathways-lab/app.js', import.meta.url), 'utf8')],
  ['/pathways-lab/app-core.js', await readFile(new URL('../pathways-lab/app-core.js', import.meta.url), 'utf8')],
  ['/pathways-lab/model.js', await readFile(new URL('../pathways-lab/model.js', import.meta.url), 'utf8')],
  ['/pathways-lab/app-fixes.js', await readFile(new URL('../pathways-lab/app-fixes.js', import.meta.url), 'utf8')],
]);

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
    },
    contains(name) { return values.has(name); },
  };
}

function createElement(tagName = 'div') {
  const element = {
    tagName,
    src: '',
    onload: null,
    onerror: null,
    onclick: null,
    onchange: null,
    oninput: null,
    value: '',
    checked: false,
    style: { setProperty() {} },
    className: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    classList: createClassList(),
    parentNode: null,
    parentElement: null,
    append() {},
    appendChild() {},
    insertBefore() {},
    remove() {},
    close() {},
    showModal() {},
    reset() {},
    select() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return element; },
    cloneNode() { return createElement(tagName); },
  };
  element.parentNode = element;
  element.parentElement = element;
  return element;
}

test('Pathways bootstrap executes the real core, model and fixes without a subject open', async () => {
  const loaded = [];
  const runtimeErrors = [];
  const consoleErrors = [];
  const elements = new Map();
  let context;

  function elementFor(id) {
    if (!elements.has(id)) elements.set(id, createElement(id === 'subjectTemplate' ? 'template' : 'div'));
    return elements.get(id);
  }

  const localStore = new Map();
  const sandbox = {
    Promise,
    Set,
    Map,
    Date,
    Error,
    Math,
    JSON,
    String,
    Array,
    Object,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    __renderCount: 0,
    console: {
      log() {},
      warn() {},
      error(...args) { consoleErrors.push(args.map(String).join(' ')); },
    },
    alert() {},
    confirm() { return true; },
    requestAnimationFrame(callback) { callback(); },
    MutationObserver: class {
      constructor() {}
      observe() {}
      disconnect() {}
    },
    localStorage: {
      getItem(key) { return localStore.has(key) ? localStore.get(key) : null; },
      setItem(key, value) { localStore.set(key, String(value)); },
      removeItem(key) { localStore.delete(key); },
    },
    navigator: { clipboard: { async writeText() {} } },
    location: { href: '', reload() {} },
    window: { open() { return {}; } },
    document: {
      documentElement: createElement('html'),
      body: createElement('body'),
      getElementById(id) {
        if (id === 'pathwaysCalmUi' || id === 'moreDetail') return null;
        return elementFor(id);
      },
      querySelectorAll() { return []; },
      addEventListener() {},
      execCommand() { return true; },
      createElement,
      head: {
        appendChild(node) {
          if (!node.src) return node;
          loaded.push(node.src);
          const source = sources.get(node.src);
          if (!source) {
            queueMicrotask(() => node.onerror?.());
            return node;
          }
          try {
            vm.runInContext(source, context, { filename: node.src });
            if (node.src.endsWith('/app-core.js')) {
              // Keep the runtime bootstrap realistic while avoiding a full DOM
              // render. app-fixes and the loader must still execute for real.
              vm.runInContext('renderAll = () => { globalThis.__renderCount += 1; };', context);
            }
          } catch (error) {
            runtimeErrors.push(error);
          }
          // Browsers fire load for a successfully fetched script even when its
          // code throws. Keeping that behavior makes runtimeErrors essential.
          queueMicrotask(() => node.onload?.());
          return node;
        },
      },
    },
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.location = sandbox.location;
  context = vm.createContext(sandbox);

  vm.runInContext(sources.get('/pathways-lab/app.js'), context, { filename: '/pathways-lab/app.js' });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(loaded, [
    '/pathways-lab/app-core.js',
    '/pathways-lab/model.js',
    '/pathways-lab/app-fixes.js',
  ]);
  assert.deepEqual(runtimeErrors, [], runtimeErrors.map(error => error.stack || String(error)).join('\n'));
  assert.deepEqual(consoleErrors, []);
  assert.equal(vm.runInContext('typeof PathwaysModel.validateObjectiveDraft', context), 'function');
  assert.match(vm.runInContext('renderTasks.toString()', context), /includeParent/);
  assert.match(vm.runInContext('parentReport.toString()', context), /buildParentReport/);
  assert.ok(sandbox.__renderCount >= 2, 'app-fixes and final bootstrap should both complete their render step');
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
