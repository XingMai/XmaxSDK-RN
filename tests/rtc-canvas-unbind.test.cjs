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
  const engine = Object.create(sandbox.exports.RTCVideo.prototype);
  engine._instance = {
    setLocalVideoCanvas: (_index, canvas) => { canvases.push(canvas.instanceId); return 0; },
    setRemoteVideoCanvas: (_key, canvas) => { canvases.push(canvas.instanceId); return 0; },
  };
  sandbox.fixture.proxyEngine(engine);
  const bind = (remote, viewId) => remote
    ? engine.setRemoteVideoCanvas({ roomId: 'room', userId: 'bot', streamIndex: 0 }, { viewId })
    : engine.setLocalVideoCanvas(0, { viewId });
  const adapter = { exports: {}, require: name =>
    name === '@volcengine/react-native-rtc' ? sandbox.exports : native };
  vm.runInNewContext(readFileSync(resolve('lib/commonjs/Foundation/RTC/RtcCanvasBinding.js'), 'utf8'), adapter);
  const detach = remote => adapter.exports.detachRtcCanvas(engine,
    remote ? { roomID: 'room', userID: 'bot' } : null);
  const viewWrites = id => messages.filter(message => message._instanceId === id &&
    message.memberName === (os === 'ios' ? 'view' : 'renderView'));
  return { bind, detach, canvases, viewWrites, messages };
}

// Exercise the installed vendor constructors, typed setters and serializer. Native
// detach/render lifecycle still requires device verification.
for (const entry of ['commonjs', 'module']) {
  for (const os of ['ios', 'android']) {
    test(`${entry}: ${os} empty view ID still serializes an unresolved view reference`, () => {
      const f = fixture(entry, os);
      f.bind(false, '');
      const writes = f.viewWrites(f.canvases.at(-1));
      assert.equal(writes.length, 1);
      assert.equal(writes[0].args[0]._serviceName, '$View');
    });

    test(`${entry}: ${os} detach uses a new canvas without writing a view or JSON null`, () => {
      const f = fixture(entry, os);
      for (const remote of [false, true]) {
        f.bind(remote, 'mounted-view');
        const bound = f.canvases.at(-1);
        assert.equal(f.viewWrites(bound).length, 1);
        assert.equal(f.viewWrites(bound)[0].args[0]._instanceId, 'mounted-view');

        const start = f.messages.length;
        assert.equal(f.detach(remote), 0);
        const reset = f.canvases.at(-1);
        assert.ok(reset);
        assert.notEqual(reset, bound);
        assert.deepEqual(f.viewWrites(reset), []);
        const detachedMessages = f.messages.slice(start);
        assert.ok(detachedMessages.some(message => message._instanceId === reset));
        assert.equal(detachedMessages.some(message =>
          JSON.stringify(message).includes('"$View"')), false);
        if (remote) {
          const serialized = JSON.stringify(detachedMessages);
          assert.ok(serialized.includes('room'));
          assert.ok(serialized.includes('bot'));
        }

        f.bind(remote, 'replacement-view');
        assert.equal(f.viewWrites(f.canvases.at(-1))[0].args[0]._instanceId, 'replacement-view');
      }
    });
  }
}
