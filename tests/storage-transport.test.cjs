const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { CosTransferManger } = require('../node_modules/react-native-cos-sdk-nobeacon/lib/commonjs/cos_transfer');

const platform = { OS: 'ios' };
const registrations = [], requests = [], cancellations = [];
const managers = new Map();
let nextTask;
const native = {
  async upload(...args) {
    requests.push(args);
    return nextTask ? await nextTask : String(requests.length);
  },
  async cancel(key, taskID) { cancellations.push([key, taskID]); },
};
mock.module('react-native', { namedExports: { Platform: platform } });
mock.module('react-native-cos-sdk-nobeacon', {
  defaultExport: {
    async registerTransferManger(key, configuration, policy) {
      registrations.push({ key, configuration, policy });
      const manager = new CosTransferManger(key, native);
      managers.set(key, manager);
      return manager;
    },
  },
});
mock.module('react-native-blob-util', { defaultExport: { fs: {} } });
mock.module(require.resolve('../lib/commonjs/Foundation/Native/NativeXmaxRuntime.js'), {
  defaultExport: {},
});
const { StorageManager } = require('../lib/commonjs/Foundation/Storage/StorageManager');

function options(endpoint, overrides = {}) {
  return {
    fileURL: 'file:///tmp/upload.jpg',
    objectKey: 'open/upload.jpg',
    contentType: 'image/jpeg',
    configuration: {
      region: 'ap-nanjing', bucket: 'fixture-123', endpoint, prefix: 'open/',
      credential: { accessKeyID: 'fixture-id', secretAccessKey: 'fixture-secret', sessionToken: 'fixture-token' },
    },
    signal: new AbortController().signal,
    progress() {},
    ...overrides,
  };
}

function succeed(request, headers = { etag: 'fixture-etag' }) {
  managers.get(request[0]).runResultSuccessCallBack(request[5], headers);
}

test('all media use simple-upload configuration through the real COS JS bridge on iOS and Android', async () => {
  for (const os of ['ios', 'android']) {
    platform.OS = os;
    const endpoint = `https://${os}.fixture.example`;
    const count = registrations.length;
    for (const [file, type] of [['photo.jpg', 'image/jpeg'], ['reference.png', 'image/png'], ['video.mp4', 'video/mp4']]) {
      const task = new StorageManager().upload(options(endpoint, {
        fileURL: `file:///tmp/${file}`, objectKey: `open/${file}`, contentType: type,
      }));
      await nextTurn();
      const request = requests.at(-1);
      assert.equal(request[3], `file:///tmp/${file}`);
      assert.equal(request[4], undefined, 'never resume a multipart upload ID');
      assert.equal(request[8], undefined, 'never install a multipart initialization callback');
      assert.equal(request[12].sessionToken, 'fixture-token');
      assert.deepEqual(request[13], { 'Content-Type': type });
      succeed(request);
      assert.deepEqual(await task, { url: `${endpoint}/open/${file}`, objectKey: `open/${file}`, etag: 'fixture-etag' });
    }
    assert.equal(registrations.length, count + 1, 'pool only the configured simple-upload manager');
    const registration = registrations.at(-1);
    assert.match(registration.key, /^xmax:simple:/);
    assert.equal(registration.policy.forceSimpleUpload, true);
    if (os === 'ios') {
      // iOS 6.5.5 dispatches file uploads by contentLength > mutilThreshold;
      // forceSimpleUpload alone is ignored by the pinned RN bridge.
      assert.equal(registration.policy.divisionForUpload, Number.MAX_SAFE_INTEGER);
      assert(registration.policy.divisionForUpload > 5 * 1024 ** 3);
    } else {
      assert.equal(registration.policy.divisionForUpload, undefined, 'do not overflow Android getInt');
    }
  }
});

test('COS errors retain HTTP and diagnostic codes without response bodies or credentials', async () => {
  const task = new StorageManager().upload(options('https://errors.fixture.example'));
  const rejected = assert.rejects(task, error => {
    assert.equal(error.code, 'UPLOAD_ERROR');
    assert.equal(error.httpStatus, 403);
    assert.equal(error.message, 'COS upload failed (HTTP 403, AccessDenied)');
    assert(!JSON.stringify(error).includes('fixture-secret'));
    return true;
  });
  await nextTurn();
  const request = requests.at(-1);
  managers.get(request[0]).runResultFailCallBack(request[5], undefined, {
    statusCode: 403, errorCode: 'AccessDenied',
    errorMessage: 'fixture-secret', details: 'Authorization: fixture-secret',
  });
  await rejected;

  const clientTask = new StorageManager().upload(options('https://errors.fixture.example'));
  const clientRejected = assert.rejects(clientTask, { message: 'COS upload failed (client -1009)', httpStatus: null });
  await nextTurn();
  const clientRequest = requests.at(-1);
  managers.get(clientRequest[0]).runResultFailCallBack(clientRequest[5], { errorCode: -1009, message: 'fixture-secret' }, { statusCode: -1, errorCode: 'signed URL: fixture-secret' });
  await clientRejected;
});

test('simple uploads preserve concurrent progress isolation and cancel a late-created native task', async () => {
  const progress = [];
  const controller = new AbortController();
  let resolveTask;
  nextTask = new Promise(resolve => { resolveTask = resolve; });
  const first = new StorageManager().upload(options('https://cancel.fixture.example', {
    signal: controller.signal, progress: () => progress.push('first'),
  }));
  const cancelled = assert.rejects(first, { code: 'CANCELLED' });
  await nextTurn();
  const firstRequest = requests.at(-1);
  nextTask = undefined;
  const second = new StorageManager().upload(options('https://cancel.fixture.example', {
    progress: () => progress.push('second'),
  }));
  await nextTurn();
  const secondRequest = requests.at(-1);
  const manager = managers.get(firstRequest[0]);
  controller.abort();
  await cancelled;
  resolveTask('late-task');
  await nextTurn();
  assert(cancellations.some(([key, id]) => key === firstRequest[0] && id === 'late-task'));
  manager.runProgressCallBack(firstRequest[7], 1, 2);
  manager.runProgressCallBack(secondRequest[7], 1, 2);
  succeed(secondRequest);
  await second;
  manager.runProgressCallBack(secondRequest[7], 2, 2);
  assert.deepEqual(progress, ['second']);
  assert.equal(manager.callbackGroups.size, 0);
});
