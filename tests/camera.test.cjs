const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const {
  RealtimeCoordinator,
} = require('../lib/commonjs/Core/Realtime/RealtimeCoordinator');
const {
  waitFor,
  abortable,
  repeatHeartbeat,
} = require('../lib/commonjs/Foundation/Runtime/Async');
const {
  XmaxError,
  XmaxErrorCode,
} = require('../lib/commonjs/Foundation/Errors/XmaxError');
const { MediaService } = require('../lib/commonjs/Service/Media/MediaService');
const {
  RealtimeSessionService,
} = require('../lib/commonjs/Service/Realtime/RealtimeSessionService');
const { ApiService } = require('../lib/commonjs/Service/Network/ApiService');
const {
  matchesTaskSEI,
} = require('../lib/commonjs/Stream/Room/TaskConfirmation');
const { roomEvent } = require('../lib/commonjs/Stream/Room/RoomEvent');
const {
  taskIDFromUUID,
} = require('../lib/commonjs/Foundation/Runtime/RuntimeInfo');
const {
  resolveBitrates,
} = require('../lib/commonjs/Stream/Encoding/EncodingController');
const runtime = {
  platform: 'ios',
  os_version: '26.6',
  sdk_version: '0.0.1',
  device_model: 'fixture',
};
const defer = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const sessionPayload = {
  sessionUid: 'session-1',
  userUid: 'user-1',
  status: 'ACTIVE',
  modelExtra: JSON.stringify({
    room_id: 'room-1',
    room_token: 'test-room-token',
    user_id: 'user-1',
    bot_name: 'bot-1',
  }),
};
function response(data, status = 200, success = true) {
  return new Response(JSON.stringify({ success, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('model dimensions match iOS fixtures and bounds', () => {
  const service = new MediaService();
  for (const [input, expected] of [
    [
      [640, 480],
      [896, 672],
    ],
    [
      [1920, 1080],
      [1504, 832],
    ],
    [
      [1010, 770],
      [1024, 768],
    ],
    [
      [832, 1472],
      [832, 1472],
    ],
  ])
    assert.deepEqual(
      service.resolveModelInputSize({ width: input[0], height: input[1] }),
      { width: expected[0], height: expected[1] },
    );
  for (const [width, height] of [
    [799, 751],
    [1130, 1130],
    [1, 1000000],
    [1000000, 1],
    [100, 100],
  ]) {
    const out = service.resolveModelInputSize({ width, height });
    assert(
      out.width * out.height >= 600000 && out.width * out.height <= 1280000,
    );
    assert.equal(out.width % 32, 0);
    assert.equal(out.height % 32, 0);
  }
  assert.throws(
    () => service.resolveModelInputSize({ width: NaN, height: 1 }),
    { code: 'INVALID_CONFIGURATION' },
  );
  assert.deepEqual(resolveBitrates({ width: 640, height: 480, fps: 15 }), {
    minimum: 500,
    maximum: 1000,
  });
  assert.deepEqual(resolveBitrates({ width: 1920, height: 1080, fps: 30 }), {
    minimum: 3150,
    maximum: 6300,
  });
});

test('room payload and OS task identifier match iOS, with strict SEI matching', () => {
  const id = taskIDFromUUID('00112233-4455-4677-8899-aabbccddeeff', 'ios');
  assert.equal(id, 'task-ABEiM0RVRneImaq7zN3u_w?os=ios');
  const payload = JSON.parse(
    roomEvent(
      'start',
      'user-1',
      runtime,
      id,
      { width: 832, height: 1472, fps: 24 },
      { prompt: '水彩', referencePath: 'image/key' },
    ),
  );
  assert.deepEqual(payload, {
    event: 'start',
    user_id: 'user-1',
    uid: id,
    params: {
      model: 'default',
      size: [832, 1472],
      prompt: '水彩',
      ref_image_path: 'image/key',
    },
    runtime,
  });
  assert(matchesTaskSEI(id, id));
  assert(matchesTaskSEI(id, `  ${id}&index=42\n`));
  for (const wrong of [
    id.split('?')[0],
    id + '&index=',
    id + '&index=-1',
    id + '&index=4x',
    id.replace('ios', 'android'),
    id + 'evil',
  ])
    assert.equal(matchesTaskSEI(id, wrong), false);
});

test('interrupt cancels confirmation promptly, cleanup runs once, operation gate reopens', async () => {
  const coordinator = new RealtimeCoordinator();
  let cleaned = 0;
  const pending = coordinator.run(signal =>
    waitFor(() => () => {}, signal, 10000, 'confirmation'),
  );
  const rejection = assert.rejects(pending, { code: 'CANCELLED' });
  await nextTurn();
  const one = coordinator.interrupt(async () => {
      cleaned++;
    }),
    two = coordinator.interrupt(async () => {
      cleaned++;
    });
  await Promise.all([one, two, rejection]);
  assert.equal(cleaned, 1);
  assert.equal(await coordinator.run(async () => 7), 7);
});

test('permission wait is cancellable without waiting for system dialog', async () => {
  const permission = defer(),
    abort = new AbortController();
  const waiting = abortable(permission.promise, abort.signal);
  abort.abort();
  await assert.rejects(waiting, { code: 'CANCELLED' });
  permission.resolve('granted');
});

test('session parser cleans up allocated sessions with invalid RTC data', async () => {
  const calls = [];
  const service = new RealtimeSessionService({
    async request(method, path) {
      calls.push([method, path]);
      return method === 'POST' ? { sessionUid: 'orphan', modelExtra: {} } : {};
    },
  });
  await assert.rejects(service.createSession('x2.0'), {
    code: 'SESSION_ERROR',
  });
  assert.deepEqual(calls, [
    ['POST', '/session'],
    ['DELETE', '/session/orphan'],
  ]);
});

test('API uses X-Api-Key and runtime headers, unwraps envelope, handles HTTP business failures', async () => {
  let request;
  const api = new ApiService(
    'test-api-key',
    'https://example.invalid',
    runtime,
    async (url, init) => {
      request = { url, init };
      return response({ sessionUid: 's' });
    },
  );
  assert.deepEqual(await api.request('POST', '/session', { model: 'x2.0' }), {
    sessionUid: 's',
  });
  assert.equal(request.url, 'https://example.invalid/session');
  assert.equal(request.init.headers['X-Api-Key'], 'test-api-key');
  assert.equal(request.init.headers['X-Platform'], 'ios');
  assert.equal(request.init.body, '{"model":"x2.0"}');
  const failing = new ApiService(
    'key',
    'https://example.invalid',
    runtime,
    async () =>
      new Response(
        JSON.stringify({ success: false, code: 4031, message: 'Denied' }),
        { status: 403 },
      ),
  );
  await assert.rejects(failing.request('POST', '/session'), {
    code: 'API_ERROR',
    apiCode: 4031,
    httpStatus: 403,
  });
});

test('stopped heartbeat ignores a late failure', async () => {
  const gate = defer();
  let failures = 0,
    started = 0;
  const stop = repeatHeartbeat(
    () => {
      started++;
      return gate.promise;
    },
    () => {
      failures++;
    },
    1,
  );
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(started, 1);
  stop();
  gate.reject(new Error('late'));
  await nextTurn();
  assert.equal(failures, 0);
});

// Mock only the native boundary; run the real Core/Media/Stream/Service implementation.
const lifecycleListeners = new Set();
mock.module('react-native', {
  namedExports: {
    AppState: {
      addEventListener(_event, listener) {
        lifecycleListeners.add(listener);
        return {
          remove() {
            lifecycleListeners.delete(listener);
          },
        };
      },
    },
  },
});
class FakeRtc {
  static instances = [];
  runtime = runtime;
  listeners = new Set();
  packets = [];
  camera = false;
  closed = false;
  joins = 0;
  closes = 0;
  constructor() {
    FakeRtc.instances.push(this);
  }
  randomUUID() {
    return require('node:crypto').randomUUID();
  }
  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of [...this.listeners]) listener(event);
  }
  async permissions() {}
  async open() {
    this.closed = false;
  }
  async startCamera() {
    this.camera = true;
  }
  configureEncoding() {}
  switchCamera() {}
  async join() {
    this.joins++;
  }
  send(message) {
    this.packets.push(JSON.parse(message));
  }
  setRemoteAudioVolume() {}
  leave() {}
  async close() {
    this.camera = false;
    this.closed = true;
    this.closes++;
  }
}
mock.module(require.resolve('../lib/commonjs/Foundation/RTC/RtcManager.js'), {
  namedExports: { RtcManager: FakeRtc },
});
const {
  XmaxRealtimeManager,
} = require('../lib/commonjs/Core/Realtime/XmaxRealtimeManager');
const config = { apiKey: 'test-key', environment: 'china', loggerOptions: 0 };
const createManager = () => new XmaxRealtimeManager(config, { model: 'x2.0' });

// Fetch is replaced only within each sequential test. No live service is contacted.
test('close during POST stops camera immediately and reclaims late session; manager can be reused', async t => {
  const post = defer();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(init.method);
    return init.method === 'POST' ? post.promise : response({});
  });
  const manager = createManager();
  const local = await manager.createLocalCameraStream();
  const rtc = FakeRtc.instances.at(-1);
  const connect = manager.connect({ localStream: local });
  const rejection = assert.rejects(connect, { code: 'CANCELLED' });
  await nextTurn();
  const closing = manager.close(),
    again = manager.close();
  await nextTurn();
  assert.equal(rtc.camera, false);
  post.resolve(response(sessionPayload));
  await Promise.all([closing, again, rejection]);
  assert.deepEqual(calls, ['POST', 'DELETE']);
  assert.equal(rtc.joins, 0);
  assert.equal(local.videoTrack.videoFormat, null);
  assert.equal(manager.currentState.connectionState, 'Disconnected');
  const replacement = await manager.createLocalCameraStream();
  assert.notEqual(replacement.videoTrack, local.videoTrack);
  await assert.rejects(manager.connect({ localStream: local }), {
    code: 'INVALID_CONFIGURATION',
  });
  await manager.close();
  assert.equal(lifecycleListeners.size, 0);
});

test('generation requires task + room + bot SEI, updates reuse task, disconnect preserves camera', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    response(init.method === 'POST' ? sessionPayload : {}),
  );
  const manager = createManager();
  const local = await manager.createLocalCameraStream();
  const rtc = FakeRtc.instances.at(-1);
  await assert.rejects(manager.connect({ localStream: { ...local } }), {
    code: 'INVALID_CONFIGURATION',
  });
  const remote = await manager.connect({ localStream: local });
  let finished = false;
  const generation = manager
    .startGeneration({
      context: { prompt: '  水彩  ', referencePath: ' image/key ' },
    })
    .then(() => {
      finished = true;
    });
  await nextTurn();
  const id = rtc.packets.find(p => p.event === 'start').uid;
  const emit = (message, roomID = 'room-1', userID = 'bot-1') =>
    rtc.emit({ type: 'sei', stream: { roomID, userID }, message });
  rtc.emit({
    type: 'decoded',
    stream: { roomID: 'room-1', userID: 'bot-1' },
    width: 832,
    height: 1472,
  });
  emit('wrong');
  emit(id, 'old-room');
  emit(id, 'other-user');
  await nextTurn();
  assert.equal(finished, false);
  emit(id + '&index=12');
  await generation;
  assert.equal(manager.currentState.connectionState, 'Generating');
  assert.equal(manager.currentState.taskID, id);
  const value = await manager.startGeneration({
    context: { prompt: '油画', referencePath: null },
  });
  assert.equal(value, undefined);
  const change = rtc.packets.find(p => p.event === 'change_condition');
  assert.equal(change.uid, id);
  assert.deepEqual(change.params, {
    model: 'default',
    size: [832, 1472],
    prompt: '油画',
  });
  const sameTrack = local.videoTrack;
  const switching = manager.switchCamera();
  await new Promise(resolve => setTimeout(resolve, 550));
  const next = rtc.packets.filter(p => p.event === 'start').at(-1);
  assert.notEqual(next.uid, id);
  assert.equal(next.params.prompt, '油画');
  emit(next.uid);
  const switched = await switching;
  assert.equal(switched.videoTrack, sameTrack);
  assert.equal(sameTrack.position, 'back');
  await manager.disconnect();
  assert.equal(rtc.camera, true);
  assert.equal(remote.videoTrack.videoFormat, null);
  emit(id);
  assert.equal(manager.currentState.connectionState, 'Disconnected');
  await manager.close();
  assert.equal(lifecycleListeners.size, 0);
});

test('close cancels generation wait and still releases camera when DELETE fails', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    init.method === 'POST'
      ? response(sessionPayload)
      : response({}, 500, false),
  );
  const manager = createManager();
  const local = await manager.createLocalCameraStream();
  const rtc = FakeRtc.instances.at(-1);
  await manager.connect({ localStream: local });
  const pending = manager.startGeneration({ context: { prompt: '水彩' } });
  const rejection = assert.rejects(pending, { code: 'CANCELLED' });
  await nextTurn();
  await assert.rejects(manager.close(), { code: 'API_ERROR' });
  await rejection;
  assert.equal(rtc.camera, false);
  assert.equal(local.videoTrack.videoFormat, null);
  assert.equal(lifecycleListeners.size, 0);
});

test('failed condition update retains task and cached prompt, switch failure releases only connection', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    response(init.method === 'POST' ? sessionPayload : {}),
  );
  const manager = createManager(),
    local = await manager.createLocalCameraStream(),
    rtc = FakeRtc.instances.at(-1);
  const remote = await manager.connect({ localStream: local });
  const pending = manager.startGeneration({ context: { prompt: 'original' } });
  await nextTurn();
  const id = rtc.packets.find(p => p.event === 'start').uid;
  rtc.emit({
    type: 'sei',
    stream: { roomID: 'room-1', userID: 'bot-1' },
    message: id,
  });
  await pending;
  const originalSend = rtc.send.bind(rtc);
  t.mock.method(rtc, 'send', message => {
    if (JSON.parse(message).event === 'change_condition')
      throw new XmaxError({
        code: XmaxErrorCode.rtcError,
        message: 'delivery failed',
      });
    originalSend(message);
  });
  await assert.rejects(
    manager.startGeneration({ context: { prompt: 'failed' } }),
    { code: 'RTC_ERROR', severity: 'RECOVERABLE' },
  );
  assert.equal(manager.currentState.taskID, id);
  assert.equal(manager.currentState.connectionState, 'Generating');
  assert.notEqual(remote.videoTrack.videoFormat, null);
  const switching = manager.switchCamera();
  await new Promise(resolve => setTimeout(resolve, 550));
  const next = rtc.packets.filter(p => p.event === 'start').at(-1);
  assert.equal(next.params.prompt, 'original');
  rtc.emit({
    type: 'sei',
    stream: { roomID: 'room-1', userID: 'bot-1' },
    message: next.uid,
  });
  await switching;
  t.mock.method(rtc, 'switchCamera', () => {
    throw new XmaxError({
      code: XmaxErrorCode.mediaError,
      message: 'camera unavailable',
    });
  });
  await assert.rejects(manager.switchCamera(), { code: 'MEDIA_ERROR' });
  assert.equal(manager.currentState.connectionState, 'Error');
  assert.equal(remote.videoTrack.videoFormat, null);
  assert.equal(rtc.camera, true);
  assert.notEqual(local.videoTrack.videoFormat, null);
  await manager.close();
});

test('background closes resources, inactive does not, throwing app listeners cannot prevent cleanup', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    response(init.method === 'POST' ? sessionPayload : {}),
  );
  const manager = createManager(),
    local = await manager.createLocalCameraStream(),
    rtc = FakeRtc.instances.at(-1);
  await manager.setStateListener(() => {
    throw new Error('host listener failed');
  });
  await manager.connect({ localStream: local });
  for (const listener of [...lifecycleListeners]) listener('inactive');
  await nextTurn();
  assert.equal(rtc.camera, true);
  for (const listener of [...lifecycleListeners]) listener('background');
  await manager.close();
  assert.equal(rtc.camera, false);
  assert.equal(local.videoTrack.videoFormat, null);
  assert.equal(manager.currentState.connectionState, 'Disconnected');
  assert.equal(lifecycleListeners.size, 0);
});

test('synchronous subscription failure is rejected and its timeout is cleaned', async () => {
  const controller = new AbortController();
  await assert.rejects(
    waitFor(
      () => {
        throw new Error('subscribe failed');
      },
      controller.signal,
      60000,
      'test',
    ),
    /subscribe failed/,
  );
});

test('async native encoder rejection prevents capture and releases the engine', async t => {
  const manager = createManager(),
    rtc = FakeRtc.instances.at(-1);
  t.mock.method(rtc, 'configureEncoding', async () => {
    throw new XmaxError({
      code: XmaxErrorCode.rtcError,
      message: 'encoder rejected',
    });
  });
  await assert.rejects(manager.createLocalCameraStream(), {
    code: 'RTC_ERROR',
  });
  assert.equal(rtc.camera, false);
  assert.equal(rtc.closed, true);
  await manager.close();
});

test('close invalidates a camera switch while its native mirror request is pending', async t => {
  const manager = createManager(),
    local = await manager.createLocalCameraStream(),
    rtc = FakeRtc.instances.at(-1);
  const gate = defer();
  t.mock.method(rtc, 'switchCamera', () => gate.promise);
  const switching = manager.switchCamera(),
    rejected = assert.rejects(switching, { code: 'CANCELLED' });
  await nextTurn();
  const closing = manager.close();
  await nextTurn();
  assert.equal(rtc.camera, false);
  assert.equal(local.videoTrack.position, null);
  gate.resolve();
  await Promise.all([closing, rejected]);
  assert.equal(manager.currentState.connectionState, 'Disconnected');
});
