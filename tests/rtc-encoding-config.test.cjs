const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the SDK mapper with the installed vendor classes and serializer.
// Only the native transport and engine setter are replaced.
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
  vm.runInNewContext(source + '\nthis.client = getGlobalMessageClient();', sandbox);
  const messages = [];
  sandbox.client.bridge.callSync = message => {
    messages.push(JSON.parse(JSON.stringify(message)));
    return { status: 0, msg: 0 };
  };
  const sdk = { exports: {}, require: name => {
    if (name === '@volcengine/react-native-rtc') return sandbox.exports;
    if (name === 'react-native') return native;
    if (name.endsWith('/RealtimeTypes')) return require('../lib/commonjs/Service/Realtime/RealtimeTypes');
    return {};
  } };
  vm.runInNewContext(readFileSync(resolve('lib/commonjs/Foundation/RTC/RtcManager.js'), 'utf8'), sdk);
  let canvas;
  const engine = { setVideoEncoderConfig([value]) { canvas = value._instance.instanceId; return 0; } };
  return {
    async configure(encoderPreference) {
      await sdk.exports.RtcManager.prototype.configureEncoding.call({ requireEngine: () => engine },
        { width: 1024, height: 1920, fps: 30, encoderPreference }, 0, 4000);
      return Object.fromEntries(messages.filter(message => message._instanceId === canvas && message.args?.length)
        .map(message => [message.memberName, message.args[0]]));
    },
  };
}

for (const entry of ['commonjs', 'module']) {
  for (const os of ['ios', 'android']) {
    test(`${entry}: ${os} encoder fields serialize explicit rates and balanced/frame/quality preferences`, async () => {
      const f = fixture(entry, os);
      for (const [preference, expected] of [[undefined, 3], ['auto', 3], ['maintainFramerate', 1], ['maintainQuality', 2]]) {
        const fields = await f.configure(preference);
        assert.equal(fields.width, 1024);
        assert.equal(fields.height, 1920);
        assert.equal(fields.frameRate, 30);
        assert.equal(fields.minBitrate, 0);
        assert.equal(fields.maxBitrate, 4000);
        assert.equal(fields[os === 'ios' ? 'encoderPreference' : 'encodePreference'], expected);
      }
    });
  }
}
