const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

let status = 200, commitFailure = false, onResponse = () => {};
const commits = [], cleaned = [];
const blob = {
  fs: {
    stat: async path => ({ size: (await fs.stat(path)).size, type: 'file' }),
    unlink: async path => { cleaned.push(path); await fs.unlink(path); },
  },
  config({ path }) {
    return { fetch() {
      const promise = fs.writeFile(path, 'complete-image').then(() => {
        onResponse();
        return { info: () => ({ status }) };
      });
      promise.progress = () => promise;
      promise.cancel = callback => callback();
      return promise;
    } };
  },
};
mock.module('react-native', { namedExports: { Platform: { OS: 'ios' }, TurboModuleRegistry: {} } });
mock.module('react-native-cos-sdk-nobeacon', { defaultExport: { default: {} } });
mock.module('react-native-blob-util', { defaultExport: { default: blob } });
mock.module(require.resolve('../lib/commonjs/Foundation/Native/NativeXmaxRuntime.js'), {
  defaultExport: {
    randomUUID,
    async replaceFile(source, destination) {
      commits.push([source, destination]);
      if (commitFailure) throw Error('commit failed');
      await fs.rename(source, destination);
    },
  },
});
const { StorageManager } = require('../lib/commonjs/Foundation/Storage/StorageManager');

test('downloads commit only successful complete files and preserve the destination on failure or abort', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'xmax-download-'));
  const destination = join(directory, 'image.jpg');
  try {
    for (const outcome of ['success', 'http-error', 'abort', 'commit-error']) {
      await fs.writeFile(destination, 'previous-image');
      status = outcome === 'http-error' ? 403 : 200;
      commitFailure = outcome === 'commit-error';
      const controller = new AbortController();
      onResponse = () => { if (outcome === 'abort') controller.abort(); };
      const count = commits.length;
      const task = new StorageManager().download({
        remoteURL: 'https://fixture.example/image.jpg', destinationURL: `file://${destination}`,
        signal: controller.signal, progress() {},
      });
      if (outcome === 'success') {
        assert.deepEqual(await task, { fileURL: `file://${destination}`, byteCount: 14 });
        assert.equal(await fs.readFile(destination, 'utf8'), 'complete-image');
        assert.equal(commits.length, count + 1);
        assert.match(commits.at(-1)[0], /image\.jpg\..+\.partial$/);
      } else {
        await assert.rejects(task, outcome === 'http-error' ? { code: 'DOWNLOAD_ERROR', httpStatus: 403 }
          : outcome === 'abort' ? { code: 'CANCELLED' } : /commit failed/);
        assert.equal(await fs.readFile(destination, 'utf8'), 'previous-image');
        assert.equal(commits.length, count + (outcome === 'commit-error' ? 1 : 0));
      }
      assert.deepEqual(await fs.readdir(directory), ['image.jpg'], 'partial files are always removed');
    }
    assert.equal(cleaned.length, 4);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
