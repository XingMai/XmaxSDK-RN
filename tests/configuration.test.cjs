const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Module } = require('node:module');
const { setImmediate: nextTurn } = require('node:timers/promises');
const ts = require('typescript');
const filename = resolve(__dirname, '../Example/XLab/src/configuration/ConfigurationStore.ts');
const compiled = new Module(filename, module);
compiled.require = name => name === '@xmax/react-native-sdk'
  ? { XmaxEnvironment: { china: 'china', global: 'global' } }
  : require(name);
compiled._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { ConfigurationStore } = compiled.exports;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async read(field) { return values.get(field) ?? null; },
    async write(field, value) { if (value) values.set(field, value); else values.delete(field); },
  };
}

test('keys and last environment survive reload without cross-environment fallback', async () => {
  const disk = storage(), store = new ConfigurationStore(disk);
  await store.load();
  store.setKey('china', 'china-fixture');
  store.selectEnvironment('global');
  assert.equal(store.getSnapshot().keys.global, '');
  store.setKey('global', 'global-fixture');
  await nextTurn();
  const reloaded = new ConfigurationStore(disk);
  await reloaded.load();
  assert.equal(reloaded.getSnapshot().environment, 'global');
  assert.deepEqual(reloaded.getSnapshot().keys, { china: 'china-fixture', global: 'global-fixture' });
  reloaded.setKey('global', '  ');
  await nextTurn();
  assert.equal(disk.values.get('china'), 'china-fixture');
  assert.equal(disk.values.has('global'), false);
});

test('rapid edits during a slow write preserve the latest value in each slot', async () => {
  const disk = storage(), first = deferred(), calls = [];
  const originalWrite = disk.write;
  disk.write = async (field, value) => {
    calls.push([field, value]);
    if (calls.length === 1) await first.promise;
    await originalWrite(field, value);
  };
  const store = new ConfigurationStore(disk);
  await store.load();
  store.setKey('china', 'old');
  store.setKey('china', 'newer');
  store.selectEnvironment('global');
  store.setKey('global', 'other');
  store.setKey('china', 'latest');
  assert.equal(store.getSnapshot().saving, true);
  first.resolve();
  await nextTurn();
  assert.equal(disk.values.get('china'), 'latest');
  assert.equal(disk.values.get('global'), 'other');
  assert.equal(disk.values.get('environment'), 'global');
  assert.equal(calls.some(([, value]) => value === 'newer'), false);
  assert.equal(store.getSnapshot().saving, false);
});

test('read failure blocks editing and can retry without overwriting saved keys', async () => {
  const disk = storage({ china: 'saved' });
  let fail = true;
  const read = disk.read;
  disk.read = async field => { if (fail) throw new Error('fixture'); return read(field); };
  const store = new ConfigurationStore(disk);
  await store.load();
  store.setKey('china', '');
  assert.equal(store.getSnapshot().loaded, false);
  assert(store.getSnapshot().error);
  assert.equal(disk.values.get('china'), 'saved');
  fail = false;
  await store.load();
  assert.equal(store.getSnapshot().keys.china, 'saved');
  assert.equal(store.getSnapshot().error, null);
});

test('failed write retains newer edits and deletion for explicit retry', async () => {
  const disk = storage({ china: 'previous' }), failure = deferred();
  let fail = true;
  const write = disk.write;
  disk.write = async (field, value) => { if (fail) await failure.promise; await write(field, value); };
  const store = new ConfigurationStore(disk);
  await store.load();
  store.setKey('china', 'intermediate');
  store.setKey('china', '');
  store.setKey('global', 'other');
  failure.reject(new Error('do not echo credentials'));
  await nextTurn();
  assert.equal(store.getSnapshot().error, '配置保存失败，请重试。');
  fail = false;
  await store.flush();
  assert.equal(disk.values.has('china'), false);
  assert.equal(disk.values.get('global'), 'other');
  assert.equal(store.getSnapshot().error, null);
});

test('initial read is coalesced and input cannot race hydration', async () => {
  const gate = deferred(), disk = storage({ china: 'stored', environment: 'global' });
  let reads = 0;
  const read = disk.read;
  disk.read = async field => { reads++; await gate.promise; return read(field); };
  const store = new ConfigurationStore(disk);
  const loading = store.load();
  assert.equal(store.load(), loading);
  store.setKey('china', 'ignored');
  store.selectEnvironment('china');
  gate.resolve();
  await loading;
  assert.equal(reads, 3);
  assert.equal(store.getSnapshot().environment, 'global');
  assert.equal(store.getSnapshot().keys.china, 'stored');
});
