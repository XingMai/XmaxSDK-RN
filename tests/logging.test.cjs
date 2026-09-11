const { test } = require('node:test');
const assert = require('node:assert/strict');
const { XmaxLogger } = require('../lib/commonjs/Foundation/Logging/XmaxLogger');
const { RtcStatsLogger } = require('../lib/commonjs/Foundation/RTC/RtcStatsLogger');
const { ApiService } = require('../lib/commonjs/Service/Network/ApiService');
const { ApiLogger } = require('../lib/commonjs/Service/Network/ApiLogger');
const { StorageService } = require('../lib/commonjs/Service/Storage/StorageService');

const runtime = { platform: 'ios', os_version: '27', sdk_version: '1.0.0', device_model: 'fixture' };

function capture(options) {
  const logs = [];
  XmaxLogger.configure(options, (level, message, option) => logs.push({ level, message, option }));
  return logs;
}

test('global logging filters every level, prefixes every line and switches existing categories immediately', () => {
  const category = XmaxLogger.api;
  for (const options of [0, 1, 2, 3]) {
    const logs = capture(options);
    let evaluations = 0;
    for (const level of ['debug', 'info', 'warn', 'error']) {
      category[level](() => { evaluations++; return 'first\nsecond'; }, 1);
      XmaxLogger.rtc[level](() => { evaluations++; return 'metric'; }, 2);
    }
    assert.equal(logs.length, options === 0 ? 0 : options === 3 ? 8 : 4);
    assert.equal(evaluations, logs.length);
    for (const log of logs) {
      assert(log.message.split('\n').every(line => line.startsWith('[Xmax][')));
      assert.equal(log.option & options, log.option);
    }
  }
  const logs = capture(0);
  category.error('existing category is disabled');
  assert.deepEqual(logs, []);
  assert.equal(XmaxLogger.isEnabled(0), false);
});

test('formatters and failing sinks cannot escape logging or interfere with work', () => {
  XmaxLogger.configure(3, () => { throw new Error('sink failed'); });
  assert.doesNotThrow(() => XmaxLogger.media.error('failure'));
  assert.doesNotThrow(() => XmaxLogger.media.debug(() => { throw new Error('getter failed'); }));
  capture(0);
});

test('API logs response status, UTF-8 size and numeric error code while excluding sensitive payloads', async () => {
  const logs = capture(1);
  const body = JSON.stringify({ success: false, code: 4011, message: 'echo-secret-prompt', data: { token: 'secret-token' } });
  const api = new ApiService('secret-api-key', 'https://example.invalid', runtime,
    async () => new Response(body, { status: 403 }));
  await assert.rejects(api.request('POST', '/session/secret-id?token=secret-query', { prompt: 'secret-prompt' }),
    { code: 'API_ERROR', apiCode: 4011 });
  const output = logs.map(log => log.message).join('\n');
  assert.match(output, /POST \/session\/:id/);
  assert.match(output, /403/);
  assert.match(output, /4011/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'error');
  for (const secret of ['secret-api-key', 'secret-query', 'secret-id', 'secret-token', 'secret-prompt']) {
    assert(!output.includes(secret));
  }
  assert.equal(ApiLogger.byteLength('汉😀'), Buffer.byteLength('汉😀'));
  capture(0);
});

test('API success, malformed JSON and transport failures retain their original results', async () => {
  const logs = capture(1);
  const success = new ApiService('key', 'https://example.invalid', runtime,
    async () => new Response(JSON.stringify({ success: true, data: { token: 'do-not-log' } })));
  assert.deepEqual(await success.request('GET', '/cos/sts'), { token: 'do-not-log' });
  const malformed = new ApiService('key', 'https://example.invalid', runtime,
    async () => new Response('secret-invalid-json'));
  await assert.rejects(malformed.request('GET', '/cos/sts'), { code: 'API_ERROR' });
  const offline = new ApiService('key', 'https://example.invalid', runtime,
    async () => { throw new Error('URL with secret'); });
  await assert.rejects(offline.request('GET', '/cos/sts'), { code: 'NETWORK_ERROR' });
  assert.deepEqual(logs.map(log => log.level), ['debug', 'error', 'error']);
  assert(!JSON.stringify(logs).includes('secret'));
  assert(!JSON.stringify(logs).includes('do-not-log'));
  capture(0);
});

test('RTC statistics read only supported platform getters and stay lazy when disabled', () => {
  const poison = new Proxy({}, { get() { throw new Error('should not read disabled statistics'); } });
  capture(0);
  assert.doesNotThrow(() => RtcStatsLogger.local(poison));
  assert.doesNotThrow(() => RtcStatsLogger.remote(poison, 'ios'));
  const logs = capture(2);
  const video = { width: 736, height: 1312, videoLossRate: 0.01, receivedKBitrate: 1000, decoderOutputFrameRate: 24,
    stallCount: 0, stallDuration: 0, e2eDelay: 100, rtt: 30 };
  Object.defineProperty(video, 'android_rendererOutputFrameRate', { get() { throw new Error('unsupported Android getter'); } });
  video.ios_renderOutputFrameRate = 23;
  RtcStatsLogger.remote({ videoStats: video }, 'ios');
  const stats = { cpuAppUsage: 0.2, cpuCores: 6, memoryUsage: 40, memoryRatio: 1, totalMemoryRatio: 30 };
  Object.defineProperty(stats, 'android_cpuTotalUsage', { get() { throw new Error('unsupported Android getter'); } });
  RtcStatsLogger.system(stats, 'ios');
  assert.equal(logs.length, 2);
  assert.match(logs[0].message, /23 fps/);
  assert.match(logs[0].message, /1%/);
  assert.match(logs[1].message, /System unavailable/);
  capture(0);
});

test('storage logs operation outcome without URLs, credentials or native error text', async () => {
  const logs = capture(1);
  const service = new StorageService({}, { download() { throw new Error('secret-url'); } }, () => 'id');
  await assert.rejects(service.download({ remoteURL: 'https://example.invalid/image?token=secret', destinationURL: 'file:///tmp/image.png' }),
    { code: 'DOWNLOAD_ERROR' });
  assert.deepEqual(logs.map(log => log.level), ['info', 'error']);
  assert(!JSON.stringify(logs).includes('secret'));
  capture(0);
});
