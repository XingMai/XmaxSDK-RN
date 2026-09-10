const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const platform = { OS: 'android' };
const nativeCalls = [];
const nativeRuntime = {
  runtimeInfo: () => JSON.stringify({ platform: platform.OS }),
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
    StreamIndex: { STREAM_INDEX_MAIN: 0 },
    VideoSourceType: { VIDEO_SOURCE_TYPE_EXTERNAL: 1 },
    VideoEncoderConfig: class {},
    VideoCaptureConfig: class {
      constructor(width, height, fps) { Object.assign(this, { width, height, fps }); }
    },
    ChannelProfile: { CHANNEL_PROFILE_COMMUNICATION: 0 },
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
          setRtcVideoEventHandler() {},
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
