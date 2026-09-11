const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const platform = { OS: 'android' };
let osVersion = '26.6';
const nativeCalls = [];
const nativeRuntime = {
  runtimeInfo: () => JSON.stringify({ platform: platform.OS, os_version: osVersion }),
  randomUUID: () => 'fixture-owner', acquire: () => true, isActive: () => true,
  async prepareRuntime() {},
  release() {},
  async startImageVideo(...args) { nativeCalls.push(['start', ...args]); },
  stopImageVideo(owner) { nativeCalls.push(['stop', owner]); },
};
mock.module('react-native', {
  namedExports: { Platform: platform, PermissionsAndroid: {} },
});
mock.module(require.resolve('../lib/commonjs/Foundation/Native/NativeXmaxRuntime.js'), {
  defaultExport: nativeRuntime,
});

const engines = [];
const orientation = { PORTRAIT: 1, LANDSCAPE: 2 };
mock.module('@volcengine/react-native-rtc', {
  namedExports: {
    VideoOrientation: orientation,
    VideoRotation: { VIDEO_ROTATION_0: 0, VIDEO_ROTATION_180: 2 },
    CameraId: { CAMERA_ID_FRONT: 0, CAMERA_ID_BACK: 1 },
    MirrorType: { MIRROR_TYPE_NONE: 0, MIRROR_TYPE_RENDER: 1, MIRROR_TYPE_RENDER_AND_ENCODER: 2 },
    StreamIndex: { STREAM_INDEX_MAIN: 0 },
    VideoSourceType: { VIDEO_SOURCE_TYPE_EXTERNAL: 1 },
    VideoEncoderConfig: class {},
    VideoCaptureConfig: class {
      constructor(width, height, fps) { Object.assign(this, { width, height, fps }); }
    },
    ChannelProfile: { CHANNEL_PROFILE_COMMUNICATION: 0 },
    // RTC 1.3.2 normalizes native success (200) to different JS values per platform.
    RoomMessageSendResult: {
      ROOM_MESSAGE_SEND_RESULT_SUCCESS: 0,
      ByteRTCRoomMessageSendResultSuccess: 7,
    },
    RTCManager: class {
      destroyRTCEngine() { nativeCalls.push(['destroy']); }
      async createRTCEngine() {
        const calls = [];
        const room = {
          setRTCRoomEventHandler(handler) { this.handler = handler; },
          joinRoom() { this.handler.onRoomStateChanged('room', 'user', 0); },
          publishStreamAudio() {},
          publishStreamVideo() {},
          leaveRoom() {},
          destroy() {},
        };
        const engine = {
          calls,
          room,
          setRtcVideoEventHandler(handler) { this.handler = handler; },
          startVideoCapture() { this.handler.onFirstLocalVideoFrameCaptured(0); },
          switchCamera(value) { calls.push(['camera', value]); return 0; },
          setVideoCaptureRotation(value) { calls.push(['rotation', value]); return 0; },
          setLocalVideoMirrorType(value) { calls.push(['mirror', value]); return 0; },
          setVideoOrientation(value) { calls.push(['orientation', value]); return 0; },
          setVideoCaptureConfig(value) { calls.push(['capture', value.width, value.height, value.fps]); },
          setVideoEncoderConfig([value]) { calls.push(['encoder', value.width, value.height]); },
          setDummyCaptureImagePath() { calls.push(['image']); },
          stopVideoCapture() { calls.push(['stopCapture']); },
          stopAudioCapture() {},
          setVideoSourceType(index, type) { calls.push(['source', index, type]); },
          createRTCRoom: () => room,
          setPlaybackVolume() {},
        };
        engines.push(engine);
        return engine;
      }
    },
  },
});
const { RtcManager } = require('../lib/commonjs/Foundation/RTC/RtcManager');
const { CameraPosition } = require('../lib/commonjs/Service/Realtime/RealtimeTypes');

test('camera start and front/back switching keep preview and encoded mirroring aligned with iOS', async () => {
  for (const os of ['ios', 'android']) {
    platform.OS = os;
    const rtc = new RtcManager();
    try {
      const signal = new AbortController().signal;
      await rtc.open(signal);
      await rtc.startCamera({ width: 736, height: 1312, fps: 24 }, CameraPosition.front, signal);
      await rtc.switchCamera(CameraPosition.back);
      await rtc.switchCamera(CameraPosition.front);

      assert.deepEqual(engines.at(-1).calls.filter(([name]) => ['camera', 'mirror'].includes(name)), [
        ['camera', 0], ['mirror', 2],
        ['camera', 1], ['mirror', 0],
        ['camera', 0], ['mirror', 2],
      ]);
      assert.deepEqual(engines.at(-1).calls.filter(([name]) => name === 'orientation'), [
        ['orientation', orientation.PORTRAIT],
      ]);
    } finally {
      await rtc.close();
      platform.OS = 'android';
    }
  }
});

test('back camera normalizes frame orientation before capture for portrait, landscape and square formats', async () => {
  for (const os of ['ios', 'android']) {
    platform.OS = os;
    for (const [width, height, expected] of [
      [736, 1312, orientation.PORTRAIT],
      [1312, 736, orientation.LANDSCAPE],
      [832, 832, orientation.LANDSCAPE],
    ]) {
      const rtc = new RtcManager();
      try {
        const signal = new AbortController().signal;
        await rtc.open(signal);
        await rtc.startCamera({ width, height, fps: 24 }, CameraPosition.back, signal);
        assert.deepEqual(engines.at(-1).calls, [
          ['orientation', expected], ['capture', width, height, 24],
          ['camera', 1], ['rotation', 0], ['mirror', 0],
        ]);
      } finally {
        await rtc.close();
      }
    }
  }
  platform.OS = 'android';
});

test('iOS 27 rear-camera rotation compensation resets on front capture and stays scoped to the affected OS', async () => {
  for (const [os, version, rearRotation] of [
    ['ios', '27', 2],
    ['ios', '27.0.1', 2],
    ['ios', '26.6', 0],
    ['ios', '28.0', 0],
    ['android', '27', 0],
  ]) {
    platform.OS = os;
    osVersion = version;
    const rtc = new RtcManager();
    try {
      const signal = new AbortController().signal;
      await rtc.open(signal);
      await rtc.startCamera({ width: 736, height: 1312, fps: 24 }, CameraPosition.back, signal);
      await rtc.switchCamera(CameraPosition.front);
      await rtc.switchCamera(CameraPosition.back);
      assert.deepEqual(engines.at(-1).calls.filter(([name]) => name === 'rotation'), [
        ['rotation', rearRotation], ['rotation', 0], ['rotation', rearRotation],
      ]);
    } finally {
      await rtc.close();
      platform.OS = 'android';
      osVersion = '26.6';
    }
  }
});

test('Android bypasses dummy capture and preserves portrait, landscape and square image dimensions', async () => {
  for (const [width, height, fps] of [
    [736, 1664, 24],
    [1664, 736, 30],
    [832, 832, 15],
  ]) {
    const rtc = new RtcManager();
    await rtc.open(new AbortController().signal);
    const format = { width, height, fps };
    rtc.configureImageSource();
    await rtc.configureEncoding(format, 500, 1000);
    await rtc.startImage('/private-image.jpg', format);
    assert.deepEqual(engines.at(-1).calls, [
      ['stopCapture'], ['source', 0, 1], ['encoder', width, height],
    ]);
    assert.deepEqual(nativeCalls.at(-1), ['start', 'fixture-owner', '/private-image.jpg', width, height, fps]);
    await rtc.close();
    assert.equal(engines.at(-1).calls.some(([event]) => event === 'image'), false);
    assert.deepEqual(nativeCalls.slice(-2), [['stop', 'fixture-owner'], ['destroy']]);
  }
});

test('the image source cannot change after joining a room', async () => {
  const rtc = new RtcManager();
  const signal = new AbortController().signal;
  await rtc.open(signal);
  await rtc.join({ roomID: 'room', userID: 'user', token: 'fixture', botName: null }, false, signal);
  assert.throws(() => rtc.configureImageSource(), {
    code: 'INVALID_CONFIGURATION',
  });
  await rtc.close();
});

test('room delivery accepts both platform success results and preserves real failures', async () => {
  for (const [os, success, failures] of [
    ['android', 0, [1, 2, 3, 4, 5, 6]],
    ['ios', 7, [8, 9, 10, 11, 12, 13, 14, 15]],
  ]) {
    platform.OS = os;
    const rtc = new RtcManager();
    const events = [];
    rtc.onEvent(event => events.push(event));
    try {
      const signal = new AbortController().signal;
      await rtc.open(signal);
      await rtc.join({ roomID: 'room', userID: 'user', token: 'fixture', botName: null }, false, signal);
      const { handler } = engines.at(-1).room;

      handler.onRoomMessageSendResult(1, success);
      assert.deepEqual(events, []);

      for (const failure of failures) {
        handler.onRoomMessageSendResult(2, failure);
        const event = events.at(-1);
        assert.equal(event.type, 'error');
        assert.equal(event.error.code, 'RTC_ERROR');
        assert.equal(event.error.message, `Room signal delivery failed (${failure})`);
      }
      assert.equal(events.length, failures.length);

      rtc.leave();
      handler.onRoomMessageSendResult(3, failures[0]);
      assert.equal(events.length, failures.length, 'Ignore callbacks from the departed room');
    } finally {
      await rtc.close();
      platform.OS = 'android';
    }
  }
});

test('a native image start completing after close cannot become active', async t => {
  let finish;
  t.mock.method(nativeRuntime, 'startImageVideo', () => new Promise(resolve => { finish = resolve; }));
  const rtc = new RtcManager();
  await rtc.open(new AbortController().signal);
  const format = { width: 736, height: 1664, fps: 24 };
  rtc.configureImageSource();
  const starting = rtc.startImage('/private-image.jpg', format);
  await rtc.close();
  finish();
  await assert.rejects(starting, { code: 'CANCELLED' });
});

test('iOS submits full native frames at the requested fps and stops them before destruction', async () => {
  platform.OS = 'ios';
  try {
    for (const [width, height, fps] of [[736, 1664, 24], [1664, 736, 30], [832, 832, 15]]) {
      const rtc = new RtcManager();
      await rtc.open(new AbortController().signal);
      const format = { width, height, fps };
      rtc.configureImageSource();
      await rtc.configureEncoding(format, 500, 1000);
      await rtc.startImage('/private-image.jpg', format);
      assert.deepEqual(engines.at(-1).calls, [
        ['stopCapture'], ['source', 0, 1], ['encoder', width, height],
      ]);
      assert.deepEqual(nativeCalls.at(-1), ['start', 'fixture-owner', '/private-image.jpg', width, height, fps]);
      await rtc.close();
      assert.equal(engines.at(-1).calls.some(([event]) => event === 'image'), false);
      assert.deepEqual(nativeCalls.slice(-2), [['stop', 'fixture-owner'], ['destroy']]);
    }
  } finally { platform.OS = 'android'; }
});

test('iOS waits for main-thread preparation and close cancels pending initialization', async t => {
  platform.OS = 'ios';
  let finish;
  t.mock.method(nativeRuntime, 'prepareRuntime', () => new Promise(resolve => { finish = resolve; }));
  const acquire = t.mock.method(nativeRuntime, 'acquire');
  const initialEngineCount = engines.length;
  try {
    const rtc = new RtcManager();
    const opening = rtc.open(new AbortController().signal);
    const rejected = assert.rejects(opening, { code: 'CANCELLED' });
    assert.equal(acquire.mock.callCount(), 0);
    await assert.rejects(rtc.open(new AbortController().signal), { code: 'INVALID_CONFIGURATION' });
    const closing = rtc.close();
    finish();
    await rejected;
    await closing;
    assert.equal(acquire.mock.callCount(), 0);
    assert.equal(engines.length, initialEngineCount);
  } finally { platform.OS = 'android'; }
});

test('iOS acquires the engine only after main-thread preparation completes', async t => {
  platform.OS = 'ios';
  let finish;
  t.mock.method(nativeRuntime, 'prepareRuntime', () => new Promise(resolve => { finish = resolve; }));
  const acquire = t.mock.method(nativeRuntime, 'acquire');
  try {
    const rtc = new RtcManager();
    const opening = rtc.open(new AbortController().signal);
    assert.equal(acquire.mock.callCount(), 0);
    finish();
    await opening;
    assert.equal(acquire.mock.callCount(), 1);
    await rtc.close();
  } finally { platform.OS = 'android'; }
});

test('interaction receipts are recoverable, bounded and cleared on leaving the room', async t => {
  const rtc = new RtcManager(), events = [];
  rtc.onEvent(event => events.push(event));
  try {
    const signal = new AbortController().signal;
    await rtc.open(signal);
    await rtc.join({ roomID: 'room', userID: 'user', token: 'fixture', botName: null }, false, signal);
    const room = engines.at(-1).room;
    let nextID = 100, sent = 0;
    room.sendRoomMessage = () => { sent++; return nextID++; };
    rtc.send('tracks', true);
    room.handler.onRoomMessageSendResult(100, 3);
    assert.equal(events.length, 0, 'A dropped track must not stop generation');
    rtc.send('start');
    room.handler.onRoomMessageSendResult(101, 3);
    assert.equal(events.length, 1, 'Generation command errors retain their existing semantics');
    for (let index = 0; index < 300; index++) rtc.send('tracks', true);
    assert.equal(sent, 258, 'Outstanding track receipts have a finite bound');
    room.handler.onRoomMessageSendResult(102, 0);
    rtc.send('tracks', true);
    assert.equal(sent, 259, 'A receipt releases its outstanding slot');
    rtc.leave();
    room.handler.onRoomMessageSendResult(103, 3);
    assert.equal(events.length, 1);
  } finally { await rtc.close(); }
});
