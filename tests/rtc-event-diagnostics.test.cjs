const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

/** Runs the installed vendor callback conversion without RTC or network calls. */
function loadVendor() {
  const logs = [];
  const native = {
    Platform: { OS: 'android' },
    NativeModules: { VertcModule: {} },
    TurboModuleRegistry: { get: () => ({}) },
    NativeEventEmitter: class {
      addListener() {
        return { remove() {} };
      }
    },
    requireNativeComponent: () => () => null,
  };
  const sandbox = {
    exports: {},
    require: name => (name === 'react-native' ? native : require(name)),
    console: { log() {}, warn() {}, error: message => logs.push(message) },
    setTimeout,
    clearTimeout,
    FinalizationRegistry: undefined,
  };
  sandbox.global = sandbox;
  const source = readFileSync(
    require.resolve('@volcengine/react-native-rtc'),
    'utf8',
  );
  vm.runInNewContext(
    source +
      '\nthis.fixture = { MessageClientImpl, MessageProtoImpl, android_RTCVideoEventHandler, LoggerImpl, t_StreamIndex };',
    sandbox,
    { filename: 'vendor-rtc.js' },
  );
  return { ...sandbox.fixture, logs };
}

test('vendor callback errors preserve message/stack without logging argument values', async () => {
  const vendor = loadVendor();
  const handler = Object.create(vendor.android_RTCVideoEventHandler.prototype);
  const client = Object.create(vendor.MessageClientImpl.prototype);
  client.proto = new vendor.MessageProtoImpl();
  client.logger = vendor.LoggerImpl.getInstance();
  client.tracer = { collectEventEmit() {} };
  client.proto.registerProxyInstance('handler-fixture', handler);
  handler._instance = {
    onSEIMessageReceived: key => key.streamIndex,
    onFirstRemoteVideoFrameDecoded: key => key.streamIndex,
    onFirstRemoteVideoFrameRendered: key => key.streamIndex,
  };

  // A native reference has no materialized streamIndex. All three conversions
  // reach the same failing getter; the old logger serialized its Error as {}.
  for (const methodName of Object.keys(handler._instance)) {
    await client._onCallEventEmit({
      _instanceId: 'handler-fixture',
      methodName,
      args: [
        {
          _type: 'instance',
          _instanceId: 'private-native-id',
          _serviceName: 'com.ss.bytertc.engine.data.RemoteStreamKey',
        },
        { privatePayload: 'private-payload-value' },
      ],
    });
    const log = vendor.logs.at(-1);
    assert.match(log, new RegExp(methodName));
    assert.match(log, /invalid value:undefined/);
    assert.match(log, /t_StreamIndex.android_to_ts/);
    assert.match(log, /argumentKeys/);
    assert.doesNotMatch(log, /private-native-id|private-payload-value/);
  }
  assert.equal(vendor.logs.length, 3);
});

test('materialized remote callback parameters still pass through unchanged', () => {
  const vendor = loadVendor();
  const handler = Object.create(vendor.android_RTCVideoEventHandler.prototype);
  const observed = [];
  handler._instance = {
    onSEIMessageReceived: (key, bytes) => {
      observed.push([key.roomId, key.userId, key.streamIndex, bytes]);
    },
    onFirstRemoteVideoFrameDecoded: (key, info) => {
      observed.push([key.streamIndex, info.width, info.height]);
    },
    onFirstRemoteVideoFrameRendered: (key, info) => {
      observed.push([key.streamIndex, info.width, info.height]);
    },
  };
  const key = { roomId: 'room-fixture', userId: 'bot-fixture', streamIndex: 0 };
  const bytes = new Uint8Array([49, 50]).buffer;
  handler.onSEIMessageReceived(key, bytes);
  handler.onFirstRemoteVideoFrameDecoded(key, { width: 640, height: 480 });
  handler.onFirstRemoteVideoFrameRendered(key, { width: 640, height: 480 });
  assert.deepEqual(observed, [
    ['room-fixture', 'bot-fixture', 0, bytes],
    [0, 640, 480],
    [0, 640, 480],
  ]);
  assert.deepEqual(vendor.logs, []);
});

test('Android string stream enums reach SEI, decoded and rendered callbacks', async () => {
  const vendor = loadVendor();
  const handler = Object.create(vendor.android_RTCVideoEventHandler.prototype);
  const client = Object.create(vendor.MessageClientImpl.prototype);
  client.proto = new vendor.MessageProtoImpl();
  client.logger = vendor.LoggerImpl.getInstance();
  client.tracer = { collectEventEmit() {} };
  client.proto.registerProxyInstance('handler-fixture', handler);
  const observed = [];
  handler._instance = {
    onSEIMessageReceived: (key, bytes) => {
      observed.push([
        key.roomId,
        key.userId,
        key.streamIndex,
        String.fromCharCode(...new Uint8Array(bytes)),
      ]);
    },
    onFirstRemoteVideoFrameDecoded: (key, info) => {
      observed.push([key.streamIndex, info.width, info.height]);
    },
    onFirstRemoteVideoFrameRendered: (key, info) => {
      observed.push([key.streamIndex, info.width, info.height]);
    },
  };

  for (const [streamIndex, expected] of [
    ['STREAM_INDEX_MAIN', 0],
    ['STREAM_INDEX_SCREEN', 1],
    [0, 0],
    [1, 1],
  ]) {
    observed.length = 0;
    for (const methodName of Object.keys(handler._instance)) {
      await client._onCallEventEmit({
        _instanceId: 'handler-fixture',
        methodName,
        args: [
          { roomId: 'room-fixture', userId: 'bot-fixture', streamIndex },
          methodName === 'onSEIMessageReceived'
            ? {
                _type: 'base64',
                _value: Buffer.from('task-fixture&index=42').toString('base64'),
              }
            : { width: 640, height: 480 },
        ],
      });
    }
    assert.deepEqual(observed, [
      ['room-fixture', 'bot-fixture', expected, 'task-fixture&index=42'],
      [expected, 640, 480],
      [expected, 640, 480],
    ]);
  }
  assert.deepEqual(vendor.logs, []);
});

test('stream enum normalization preserves invalid input errors and iOS mapping', () => {
  const { t_StreamIndex } = loadVendor();
  for (const value of [
    undefined,
    null,
    2,
    -1,
    'MAIN',
    'STREAM_INDEX_UNKNOWN',
  ]) {
    assert.throws(() => t_StreamIndex.android_to_ts(value), /invalid value:/);
  }
  assert.equal(t_StreamIndex.ios_to_ts(0), 0);
  assert.equal(t_StreamIndex.ios_to_ts(1), 1);
  assert.throws(
    () => t_StreamIndex.ios_to_ts('STREAM_INDEX_MAIN'),
    /invalid value:/,
  );
});
