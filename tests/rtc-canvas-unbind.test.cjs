const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the installed vendor proxy, canvas classes, property decorators and message
// encoder. Replace only the native transport; observe the exact serialized writes.
function fixture(entry, os) {
  const native = {
    Platform: { OS: os }, NativeModules: { VertcModule: {} },
    TurboModuleRegistry: { get: () => ({}) },
    NativeEventEmitter: class { addListener() { return { remove() {} }; } },
    requireNativeComponent: () => () => null,
  };
  const sandbox = {
    exports: {}, require: name => name === 'react-native' ? native : require(name),
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    FinalizationRegistry: undefined,
  };
  sandbox.global = sandbox;
  let source = readFileSync(resolve('node_modules/@volcengine/react-native-rtc/lib', entry, 'index.js'), 'utf8');
  if (entry === 'module') source = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source + '\nthis.fixture = { proxyEngine, getGlobalMessageClient };', sandbox);
  const messages = [], canvases = [];
  sandbox.fixture.getGlobalMessageClient().bridge.callSync = message => {
    messages.push(JSON.parse(JSON.stringify(message)));
    return { status: 0, msg: 0 };
  };
  const engine = {
    setLocalVideoCanvas: (_index, canvas) => { canvases.push(canvas._instance.instanceId); return 0; },
    setRemoteVideoCanvas: (_key, canvas) => { canvases.push(canvas._instance.instanceId); return 0; },
  };
  sandbox.fixture.proxyEngine(engine);
  const bind = (remote, viewId) => remote
    ? engine.setRemoteVideoCanvas({ roomId: 'room', userId: 'bot', streamIndex: 0 }, { viewId })
    : engine.setLocalVideoCanvas(0, { viewId });
  const viewWrites = id => messages.filter(message => message._instanceId === id &&
    message.memberName === (os === 'ios' ? 'view' : 'renderView'));
  return { bind, canvases, viewWrites };
}

for (const entry of ['commonjs', 'module']) {
  test(`${entry}: iOS local and remote unbind preserve native nil without sending JSON null`, () => {
    const f = fixture(entry, 'ios');
    for (const remote of [false, true]) {
      f.bind(remote, 'mounted-view');
      const bound = f.canvases.at(-1);
      assert.equal(f.viewWrites(bound).length, 1);
      assert.equal(f.viewWrites(bound)[0].args[0]._instanceId, 'mounted-view');
      assert.equal(f.viewWrites(bound)[0].args[0]._serviceName, '$View');
      f.bind(remote, '');
      const unbound = f.canvases.at(-1);
      assert.notEqual(unbound, bound, 'Detach must use a fresh canvas with its default nil view');
      assert.deepEqual(f.viewWrites(unbound), [], 'JSON null becomes NSNull in the native setter');
      f.bind(remote, 'replacement-view');
      assert.equal(f.viewWrites(f.canvases.at(-1))[0].args[0]._instanceId, 'replacement-view');
    }
  });

  test(`${entry}: Android still explicitly clears local and remote renderView`, () => {
    const f = fixture(entry, 'android');
    for (const remote of [false, true]) {
      f.bind(remote, 'mounted-view');
      assert.equal(f.viewWrites(f.canvases.at(-1))[0].args[0]._instanceId, 'mounted-view');
      f.bind(remote, '');
      assert.deepEqual(f.viewWrites(f.canvases.at(-1))[0].args, [null]);
    }
  });
}
