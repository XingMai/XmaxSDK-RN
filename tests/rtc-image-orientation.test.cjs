const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const platform = { OS: 'android' };
const nativeCalls = [];
const nativeRuntime = {
  runtimeInfo: () => JSON.stringify({ platform: platform.OS }),
  randomUUID: () => 'fixture-owner', acquire: () => true, isActive: () => true,
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
          publishStreamVideo() {},
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
  for (const [width, height] of [
    [736, 1664, orientation.PORTRAIT],
    [1664, 736, orientation.LANDSCAPE],
    [832, 832, orientation.PORTRAIT],
  ]) {
    const rtc = new RtcManager();
    await rtc.open(new AbortController().signal);
    const format = { width, height, fps: 24 };
    rtc.configureImageSource(format);
    await rtc.configureEncoding(format, 500, 1000);
    await rtc.startImage('/private-image.jpg', format);
    assert.deepEqual(engines.at(-1).calls, [
      ['stopCapture'], ['source', 0, 1], ['encoder', width, height],
    ]);
    assert.deepEqual(nativeCalls.at(-1), ['start', 'fixture-owner', '/private-image.jpg', width, height, 24]);
    await rtc.close();
    assert.deepEqual(nativeCalls.slice(-2), [['stop', 'fixture-owner'], ['destroy']]);
  }
});

test('actual outgoing dimensions are logged once per size and orientation cannot change after join', async () => {
  const logs = [];
  const rtc = new RtcManager({
    businessEnabled: true,
    business: (event, data) => logs.push([event, data]),
  });
  const signal = new AbortController().signal;
  await rtc.open(signal);
  await rtc.join({ roomID: 'room', userID: 'user', token: 'fixture', botName: null }, false, signal);
  assert.throws(() => rtc.configureImageSource({ width: 736, height: 1664, fps: 24 }), {
    code: 'INVALID_CONFIGURATION',
  });
  const handler = engines.at(-1).room.handler;
  const stats = (width, height, isScreen = false) => ({
    isScreen,
    videoStats: { encodedFrameWidth: width, encodedFrameHeight: height },
  });
  handler.onLocalStreamStats(stats(0, 0));
  handler.onLocalStreamStats(stats(1664, 736));
  handler.onLocalStreamStats(stats(1664, 736));
  handler.onLocalStreamStats(stats(736, 1664, true));
  handler.onLocalStreamStats(stats(736, 1664));
  assert.deepEqual(logs, [
    ['Local video encoded dimensions', { width: 1664, height: 736 }],
    ['Local video encoded dimensions', { width: 736, height: 1664 }],
  ]);
});


test('a native image start completing after close cannot become active', async t => {
  let finish;
  t.mock.method(nativeRuntime, 'startImageVideo', () => new Promise(resolve => { finish = resolve; }));
  const rtc = new RtcManager();
  await rtc.open(new AbortController().signal);
  const format = { width: 736, height: 1664, fps: 24 };
  rtc.configureImageSource(format);
  const starting = rtc.startImage('/private-image.jpg', format);
  await rtc.close();
  finish();
  await assert.rejects(starting, { code: 'CANCELLED' });
});

test('iOS keeps the existing dummy source and image orientation', async () => {
  platform.OS = 'ios';
  try {
    const rtc = new RtcManager();
    await rtc.open(new AbortController().signal);
    const format = { width: 736, height: 1664, fps: 24 };
    rtc.configureImageSource(format);
    await rtc.startImage('/private-image.jpg', format);
    assert.deepEqual(engines.at(-1).calls, [['orientation', 1], ['image'], ['stopCapture']]);
  } finally { platform.OS = 'android'; }
});
