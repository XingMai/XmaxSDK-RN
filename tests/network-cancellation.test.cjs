const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { ApiService } = require('../lib/commonjs/Service/Network/ApiService');
const { RealtimeSessionService } = require('../lib/commonjs/Service/Realtime/RealtimeSessionService');
const { StorageService } = require('../lib/commonjs/Service/Storage/StorageService');
const { repeatHeartbeat } = require('../lib/commonjs/Foundation/Runtime/Async');
const { XmaxError, XmaxErrorCode } = require('../lib/commonjs/Foundation/Errors/XmaxError');
const { XmaxLogger } = require('../lib/commonjs/Foundation/Logging/XmaxLogger');

const runtime = { platform: 'android', os_version: '16', sdk_version: '1.0.0', device_model: 'fixture' };
const makeApi = transport => new ApiService('fixture-key', 'https://example.invalid', runtime, transport);
const response = data => new Response(JSON.stringify({ success: true, data }));
const stalled = signal => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
});

for (const stage of ['request', 'body']) {
  test(`caller cancellation aborts HTTP ${stage}, releases listeners and logs CANCELLED`, async t => {
    const logs = [];
    XmaxLogger.configure(1, (_level, message) => logs.push(message));
    t.after(() => XmaxLogger.configure(0));
    const caller = new AbortController();
    let requestSignal;
    const api = makeApi(async (_url, init) => {
      requestSignal = init.signal;
      return stage === 'request' ? stalled(init.signal) : { status: 200, ok: true, text: () => stalled(init.signal) };
    });
    const pending = api.request('POST', '/session', {}, caller.signal);
    const rejected = assert.rejects(pending, { code: 'CANCELLED', message: 'API request was cancelled' });
    await nextTurn();
    caller.abort();
    await rejected;
    assert.equal(requestSignal.aborted, true);
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /CANCELLED/);
    assert.doesNotMatch(logs[0], /NETWORK_ERROR|TIMEOUT/);
  });
}

test('pre-cancelled requests never dispatch and completed requests release their cancellation listener', async () => {
  let calls = 0, completedSignal;
  const api = makeApi(async (_url, init) => { calls++; completedSignal = init.signal; return response({}); });
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(api.request('GET', '/cos/sts', undefined, caller.signal), { code: 'CANCELLED' });
  assert.equal(calls, 0);
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
  const active = new AbortController();
  await api.request('GET', '/cos/sts', undefined, active.signal);
  assert.equal(getEventListeners(active.signal, 'abort').length, 0);
  active.abort();
  assert.equal(completedSignal.aborted, false);
});

for (const firstCause of ['caller', 'timeout']) {
  test(`HTTP abort classification preserves the first cause (${firstCause}) until transport rejection`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let rejectTransport;
    const api = makeApi(() => new Promise((_resolve, reject) => { rejectTransport = reject; }));
    const caller = new AbortController();
    const pending = api.request('GET', '/cos/sts', undefined, caller.signal);
    const rejected = assert.rejects(pending, { code: firstCause === 'caller' ? 'CANCELLED' : 'NETWORK_ERROR' });
    if (firstCause === 'caller') caller.abort();
    t.mock.timers.tick(15000);
    caller.abort();
    rejectTransport(new DOMException('Aborted', 'AbortError'));
    await rejected;
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
  });
}

test('transport details reach callers without entering SDK logs, and SDK errors retain identity', async t => {
  const logs = [];
  XmaxLogger.configure(1, (_level, message) => logs.push(message));
  t.after(() => XmaxLogger.configure(0));
  for (const [failure, expected] of [
    [new TypeError('  Network request failed  '), 'HTTP request failed: Network request failed'],
    [{ message: 'TLS handshake failed private-detail', code: -1200 }, 'HTTP request failed: TLS handshake failed private-detail（平台错误码：-1200）'],
    [Object.assign(new Error('DNS lookup failed private-detail'), { code: 'ENOTFOUND' }), 'HTTP request failed: DNS lookup failed private-detail（平台错误码：ENOTFOUND）'],
    [{ message: '  ' }, 'HTTP request failed: Network request failed'],
    ['Connection refused', 'HTTP request failed: Connection refused'],
  ]) {
    await assert.rejects(makeApi(async () => { throw failure; }).request('GET', '/cos/sts'), {
      code: 'NETWORK_ERROR', message: expected,
    });
  }
  assert(!JSON.stringify(logs).includes('private-detail'));
  const sdkError = new XmaxError({ code: XmaxErrorCode.apiError, message: 'Denied', apiCode: 4001, httpStatus: 403 });
  await assert.rejects(makeApi(async () => { throw sdkError; }).request('GET', '/cos/sts'), error => error === sdkError);
  await assert.rejects(makeApi(async () => { throw new DOMException('Aborted', 'AbortError'); }).request('GET', '/cos/sts'), { code: 'CANCELLED' });
});

test('stopping a heartbeat aborts its active HTTP request without delivering failure or scheduling another tick', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal, calls = 0;
  const failures = [];
  const sessions = new RealtimeSessionService(makeApi((_url, init) => {
    calls++;
    signal = init.signal;
    return stalled(signal);
  }));
  const stop = repeatHeartbeat(signal => sessions.heartbeat('session-1', signal), error => failures.push(error));
  t.mock.timers.tick(10000);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  stop();
  stop();
  await nextTurn();
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(30000);
  await nextTurn();
  assert.equal(calls, 1);
  assert.deepEqual(failures, []);
});

for (const stage of ['credentials', 'safety']) {
  test(`storage cancellation aborts ${stage} HTTP without affecting an independent request`, async () => {
    const caller = new AbortController();
    let storageSignal, independentSignal, resolveIndependent;
    const api = makeApi(async (url, init) => {
      if (url.endsWith('/independent')) {
        independentSignal = init.signal;
        return new Promise(resolve => { resolveIndependent = resolve; });
      }
      if (stage === 'safety' && url.endsWith('/cos/sts')) {
        return response({ bucket: 'fixture-123', region: 'ap-nanjing', endpoint: '', prefix: 'open/',
          credentials: { accessKeyId: 'id', secretAccessKey: 'secret', sessionToken: 'token' } });
      }
      storageSignal = init.signal;
      return stalled(storageSignal);
    });
    let uploads = 0;
    const storage = new StorageService(api, {
      fileSize: async () => 12,
      upload: async () => { uploads++; return { url: 'https://example.invalid/image.png', objectKey: 'image.png' }; },
    }, () => 'id');
    const independent = api.request('GET', '/independent');
    const upload = storage.upload({ fileURL: 'file:///tmp/image.png', signal: caller.signal }, 'image', true);
    const rejected = assert.rejects(upload, { code: 'CANCELLED' });
    await nextTurn();
    assert.equal(storageSignal.aborted, false);
    caller.abort();
    await rejected;
    assert.equal(storageSignal.aborted, true);
    assert.equal(uploads, stage === 'safety' ? 1 : 0);
    assert.equal(independentSignal.aborted, false);
    resolveIndependent(response({ alive: true }));
    assert.deepEqual(await independent, { alive: true });
  });
}

test('native bridge errors retain only recognized SDK codes and valid numeric metadata', () => {
  for (const code of Object.values(XmaxErrorCode)) {
    for (const native of [Object.assign(new Error('Native failure'), { code }), { code, message: 'Native failure' }]) {
      const result = XmaxError.from(native);
      assert(result instanceof XmaxError);
      assert.equal(result.code, code);
      assert.equal(result.message, 'Native failure');
      assert.equal(XmaxError.from(result), result);
    }
  }
  const normalized = XmaxError.from({ code: 'API_ERROR', message: 'Denied', apiCode: 4001, httpStatus: 403 });
  assert.equal(normalized.apiCode, 4001);
  assert.equal(normalized.httpStatus, 403);
  const invalid = XmaxError.from({ code: 'MEDIA_ERROR', message: 'Decode failed', apiCode: '4001', httpStatus: NaN });
  assert.equal(invalid.apiCode, null);
  assert.equal(invalid.httpStatus, null);
  for (const code of ['ENOENT', 'toString', 123, null]) {
    const unknown = XmaxError.from({ code, message: 'Unknown native failure', apiCode: 4001 });
    assert.equal(unknown.code, 'INTERNAL_ERROR');
    assert.equal(unknown.message, 'Unknown native failure');
    assert.equal(unknown.apiCode, null);
  }
});
