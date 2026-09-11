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
  sdk_version: '1.0.0',
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

test('model dimensions match fixtures and the iOS pixel bounds', () => {
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
    [1450, 1450],
    [3840, 2160],
    [2160, 3840],
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

test('nonempty model buckets require exact dimensions before rounding or resizing', () => {
  const { realtimeModelSpecifications } = require('../lib/commonjs/Service/Realtime/RealtimeTypes');
  assert.deepEqual(realtimeModelSpecifications['x2.0'].resolutionBuckets, []);
  const pro = new MediaService('x2.0-pro');
  for (const size of [{ width: 1024, height: 1920 }, { width: 1920, height: 1024 }]) {
    assert.deepEqual(pro.resolveModelInputSize(size), size);
  }
  for (const [width, height] of [
    [640, 480], [512, 960], [2048, 3840], [1024, 1024],
    [1920, 1080], [1023.9, 1920], [1024, 1919.9],
    [0, 1920], [NaN, 1920], [Infinity, 1920],
  ]) {
    assert.throws(() => pro.resolveModelInputSize({ width, height }), error => {
      assert.equal(error.code, 'INVALID_CONFIGURATION');
      assert.match(error.message, /1024×1920, 1920×1024/);
      return true;
    });
  }
});

test('iOS room payload omits the OS task suffix, with strict SEI matching', () => {
  const id = taskIDFromUUID('00112233-4455-4677-8899-aabbccddeeff');
  assert.equal(id, 'task-ABEiM0RVRneImaq7zN3u_w');
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
    id + '?os=ios',
    id + '?os=ios&index=42',
    id + '&index=',
    id + '&index=-1',
    id + '&index=4x',
    id + '?os=android',
    id + 'evil',
  ])
    assert.equal(matchesTaskSEI(id, wrong), false);
});

test('both platforms use suffix-free task IDs for every command and SEI confirmation', () => {
  const id = taskIDFromUUID('00112233-4455-4677-8899-aabbccddeeff');
  assert.equal(id, 'task-ABEiM0RVRneImaq7zN3u_w');

  for (const platform of ['ios', 'android']) {
    for (const event of ['start', 'change_condition', 'stop']) {
      const payload = JSON.parse(
        roomEvent(event, 'user-1', { ...runtime, platform }, id),
      );
      assert.equal(payload.uid, id);
      assert.equal(payload.runtime.platform, platform);
    }
  }

  assert(matchesTaskSEI(id, id));
  assert(matchesTaskSEI(id, ` ${id}&index=42\n`));
  for (const wrong of [
    `${id}?os=android`,
    `${id}?os=android&index=42`,
    `${id}?os=ios`,
    `${id}&index=-1`,
    `${id}&index=4x`,
    `${id}other`,
  ]) {
    assert.equal(matchesTaskSEI(id, wrong), false);
  }
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
  permissionCalls = 0;
  imagePath = null;
  async permissions() { this.permissionCalls++; }
  startImage(path) { this.imagePath = path; }
  async open() {
    this.closed = false;
  }
  async startCamera() {
    this.camera = true;
  }
  configureEncoding() {}
  configureImageSource() { this.imageSourceConfigured = true; }
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
    this.imagePath = null;
    this.closed = true;
    this.closes++;
  }
}
mock.module(require.resolve('../lib/commonjs/Foundation/RTC/RtcManager.js'), {
  namedExports: { RtcManager: FakeRtc },
});
class FakeImages {
  static instances = [];
  removed = [];
  prepared = [];
  constructor() { FakeImages.instances.push(this); }
  async size() { return { width: 1010, height: 770 }; }
  async prepare(_source, size) {
    this.prepared.push(size);
    return 'file:///cache/prepared%20image.jpg';
  }
  async remove(path) { this.removed.push(path); }
}
mock.module(require.resolve('../lib/commonjs/Foundation/Media/ImageManager.js'), {
  namedExports: { ImageManager: FakeImages },
});
const {
  XmaxRealtimeManager,
} = require('../lib/commonjs/Core/Realtime/XmaxRealtimeManager');
const config = { apiKey: 'test-key', environment: 'china', loggerOptions: 0 };
const createManager = () => new XmaxRealtimeManager(config, { model: 'x2.0' });

test('camera validates buckets before permission and preserves accepted dimensions and fps', async () => {
  const manager = new XmaxRealtimeManager(config, { model: 'x2.0-pro' });
  const rtc = FakeRtc.instances.at(-1);
  try {
    for (const videoFormat of [
      { width: 640, height: 480, fps: 24 },
      { width: 1024, height: 1920, fps: 0 },
      { width: 1024, height: 1918, fps: 24 },
    ]) {
      await assert.rejects(manager.createLocalCameraStream({ videoFormat }), {
        code: 'INVALID_CONFIGURATION',
      });
    }
    assert.equal(rtc.permissionCalls, 0);
    assert.equal(rtc.camera, false);
    const defaultStream = await manager.createLocalCameraStream();
    assert.deepEqual(defaultStream.videoTrack.videoFormat, { width: 1024, height: 1920, fps: 24 });
    await manager.stopLocalCameraStream();
    for (const videoFormat of [
      { width: 1024, height: 1920, fps: 15 },
      { width: 1920, height: 1024, fps: 30 },
    ]) {
      const local = await manager.createLocalCameraStream({ videoFormat });
      assert.deepEqual(local.videoTrack.videoFormat, videoFormat);
      await manager.stopLocalCameraStream();
    }
  } finally {
    await manager.close();
  }

  const flexible = createManager();
  try {
    const defaultStream = await flexible.createLocalCameraStream();
    assert.deepEqual(defaultStream.videoTrack.videoFormat, { width: 832, height: 1472, fps: 24 });
    await flexible.stopLocalCameraStream();
    const local = await flexible.createLocalCameraStream({
      videoFormat: { width: 640, height: 480, fps: 15 },
    });
    assert.deepEqual(local.videoTrack.videoFormat, { width: 896, height: 672, fps: 15 });
  } finally {
    await flexible.close();
  }
});

test('image buckets reject unsupported explicit and source sizes before preparation', async t => {
  const manager = new XmaxRealtimeManager(config, { model: 'x2.0-pro' });
  const images = FakeImages.instances.at(-1), rtc = FakeRtc.instances.at(-1);
  try {
    for (const videoFormat of [
      undefined,
      { width: 640, height: 480, fps: 24 },
      { width: 1023.9, height: 1920, fps: 24 },
      { width: 1024, height: 1920, fps: 0 },
    ]) {
      await assert.rejects(manager.createLocalImageStream({ fileURL: '/image.jpg', videoFormat }), {
        code: 'INVALID_CONFIGURATION',
      });
    }
    assert.equal(images.prepared.length, 0);
    assert.equal(rtc.imagePath, null);
    for (const videoFormat of [
      { width: 1024, height: 1920, fps: 15 },
      { width: 1920, height: 1024, fps: 30 },
    ]) {
      const local = await manager.createLocalImageStream({ fileURL: '/image.jpg', videoFormat });
      assert.deepEqual(local.videoTrack.videoFormat, videoFormat);
      assert.deepEqual(images.prepared.at(-1), videoFormat);
      await manager.stopLocalImageStream();
    }
    t.mock.method(images, 'size', async () => ({ width: 1920, height: 1024 }));
    const local = await manager.createLocalImageStream({ fileURL: '/image.jpg' });
    assert.deepEqual(local.videoTrack.videoFormat, { width: 1920, height: 1024, fps: 24 });
  } finally {
    await manager.close();
  }
});

test('client accepts pro and sends its model value to the session API', async t => {
  const configured = [], nativeLogs = [];
  // Storage native modules are unrelated to realtime model selection.
  mock.module(require.resolve('../lib/commonjs/Foundation/Storage/StorageManager.js'), {
    namedExports: { StorageManager: class {} },
  });
  mock.module(require.resolve('../lib/commonjs/Foundation/Native/NativeXmaxRuntime.js'), {
    defaultExport: { configureLogging(options) { configured.push(options); }, writeLog(level, message) { nativeLogs.push({ level, message }); } },
  });
  const { XmaxClient } = require('../lib/commonjs/Core/XmaxClient');
  const { RealtimeModel } = require('../lib/commonjs/Service/Realtime/RealtimeTypes');
  const client = new XmaxClient(config);
  const { XmaxLogger } = require('../lib/commonjs/Foundation/Logging/XmaxLogger');
  new XmaxClient({ ...config, loggerOptions: 3 });
  XmaxLogger.realtime.info('existing category enabled by latest client');
  new XmaxClient({ ...config, loggerOptions: 0 });
  XmaxLogger.realtime.info('disabled for existing services too');
  assert.deepEqual(configured, [config.loggerOptions, 3, 0]);
  assert.equal(nativeLogs.length, 1);
  assert.equal(nativeLogs[0].message, '[Xmax][Realtime] existing category enabled by latest client');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    if (init.method === 'POST') requests.push(JSON.parse(init.body));
    return response(init.method === 'POST' ? sessionPayload : {});
  });
  const manager = client.createRealtimeManager({ model: RealtimeModel.x2_0_pro });
  try {
    const media = client.createMediaService(RealtimeModel.x2_0_pro);
    assert.equal(media.model, 'x2.0-pro');
    assert.deepEqual(media.resolveModelInputSize({ width: 1024, height: 1920 }), {
      width: 1024, height: 1920,
    });
    assert.equal(client.createMediaService().model, 'x2.0');
    const local = await manager.createLocalCameraStream();
    await manager.connect({ localStream: local });
    assert.deepEqual(requests, [{ model: 'x2.0-pro' }]);
    assert.throws(() => client.createRealtimeManager({ model: 'unknown' }), {
      code: 'INVALID_CONFIGURATION',
    });
    assert.throws(() => client.createMediaService('unknown'), {
      code: 'INVALID_CONFIGURATION',
    });
  } finally {
    await manager.close();
  }
});

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


test('image pipeline uses prepared dimensions/path, no camera permissions, and correct source stops', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    response(init.method === 'POST' ? sessionPayload : {}),
  );
  const manager = createManager();
  const local = await manager.createLocalImageStream({ fileURL: 'file:///original.heic' });
  const rtc = FakeRtc.instances.at(-1), images = FakeImages.instances.at(-1);
  assert.deepEqual(local.videoTrack.videoFormat, { width: 1024, height: 768, fps: 24 });
  assert.equal(local.videoTrack.position, null);
  assert.equal(rtc.imagePath, '/cache/prepared image.jpg');
  assert.equal(rtc.imageSourceConfigured, true);
  assert.equal(rtc.permissionCalls, 0);
  assert.equal(rtc.camera, false);
  await manager.stopLocalCameraStream();
  assert(local.videoTrack.videoFormat);
  await assert.rejects(manager.createLocalCameraStream(), { code: 'INVALID_CONFIGURATION' });
  await assert.rejects(manager.createLocalImageStream({ fileURL: '/second.jpg' }), { code: 'INVALID_CONFIGURATION' });
  await manager.connect({ localStream: local });
  const generation = manager.startGeneration({ context: { prompt: 'animate', referencePath: 'https://example.test/ref.jpg' } });
  await nextTurn();
  const start = rtc.packets.find(p => p.event === 'start');
  assert.deepEqual(start.params.size, [1024, 768]);
  assert.equal(start.params.ref_image_path, 'https://example.test/ref.jpg');
  rtc.emit({ type: 'sei', stream: { roomID: 'room-1', userID: 'bot-1' }, message: start.uid });
  await generation;
  await assert.rejects(manager.switchCamera(), { code: 'INVALID_CONFIGURATION' });
  await assert.rejects(manager.stopLocalImageStream(), { code: 'INVALID_CONFIGURATION' });
  assert.equal(manager.currentState.taskID, start.uid);
  await manager.disconnect();
  assert(local.videoTrack.videoFormat);
  assert.equal(images.removed.length, 0);
  await manager.stopLocalImageStream();
  assert.equal(local.videoTrack.videoFormat, null);
  assert.equal(rtc.imagePath, null);
  assert.deepEqual(images.removed, ['file:///cache/prepared%20image.jpg']);
  const camera = await manager.createLocalCameraStream();
  await manager.stopLocalImageStream();
  assert(camera.videoTrack.videoFormat);
  await manager.close();
});

test('close during image preparation removes late file and never starts image RTC', async t => {
  const manager = createManager();
  const images = FakeImages.instances.at(-1), rtc = FakeRtc.instances.at(-1);
  const preparation = defer();
  t.mock.method(images, 'prepare', () => preparation.promise);
  const creating = manager.createLocalImageStream({ fileURL: '/original.png' });
  const rejected = assert.rejects(creating, { code: 'CANCELLED' });
  await nextTurn();
  const closing = manager.close();
  preparation.resolve('file:///late.jpg');
  await Promise.all([closing, rejected]);
  assert.equal(rtc.imagePath, null);
  assert.deepEqual(images.removed, ['file:///late.jpg']);
  assert.equal(lifecycleListeners.size, 0);
  images.prepare.mock.restore();
  const local = await manager.createLocalImageStream({ fileURL: '/replacement.png' });
  assert(local.videoTrack.videoFormat);
  await manager.close();
});

test('image RTC failure removes only prepared copy, invalid fps never prepares', async t => {
  const manager = createManager();
  const images = FakeImages.instances.at(-1), rtc = FakeRtc.instances.at(-1);
  await assert.rejects(manager.createLocalImageStream({ fileURL: '/image.jpg', videoFormat: { width: 640, height: 480, fps: 0 } }), { code: 'INVALID_CONFIGURATION' });
  assert.equal(images.prepared.length, 0);
  t.mock.method(rtc, 'startImage', () => { throw new Error('image rejected'); });
  await assert.rejects(manager.createLocalImageStream({ fileURL: '/image.jpg' }), /image rejected/);
  assert.deepEqual(images.removed, ['file:///cache/prepared%20image.jpg']);
  rtc.startImage.mock.restore();
  const local = await manager.createLocalImageStream({ fileURL: '/image.jpg', videoFormat: { width: 641, height: 481, fps: 15 } });
  assert.deepEqual(local.videoTrack.videoFormat, { width: 896, height: 672, fps: 15 });
  await manager.close();
});

test('background destroys image source, removes prepared file, and foreground does not generate', async () => {
  const manager = createManager();
  const local = await manager.createLocalImageStream({ fileURL: '/image.jpg' });
  const rtc = FakeRtc.instances.at(-1), images = FakeImages.instances.at(-1);
  for (const listener of [...lifecycleListeners]) listener('background');
  await manager.close();
  assert.equal(local.videoTrack.videoFormat, null);
  assert.equal(rtc.imagePath, null);
  assert.equal(images.removed.length, 1);
  assert.equal(rtc.packets.length, 0);
  assert.equal(lifecycleListeners.size, 0);
});
