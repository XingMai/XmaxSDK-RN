const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Module } = require('node:module');
const ts = require('typescript');

// Exercise the actual App controller; replace only file and upload boundaries.
const filename = resolve(
  __dirname,
  '../Example/XLab/src/realtime/ReferenceUploadTask.ts',
);
const compiled = new Module(filename, module);
compiled._compile(
  ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const { ReferenceUploadTask } = compiled.exports;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const updates = [],
    errors = [];
  let copies = 0,
    uploads = 0,
    disposals = 0;
  const file = {
    fileURL: 'file:///cache/reference.png',
    contentType: 'image/png',
    dispose: async () => {
      disposals++;
    },
  };
  const task = new ReferenceUploadTask(
    async () => {
      copies++;
      return overrides.prepare ? overrides.prepare(file) : file;
    },
    async (source, signal) => {
      uploads++;
      return overrides.upload
        ? overrides.upload(source, signal)
        : { url: 'https://fixture.example/reference.png' };
    },
    update => updates.push(update),
    error => errors.push(error),
  );
  return {
    task,
    updates,
    errors,
    file,
    counts: () => ({ copies, uploads, disposals }),
  };
}

test('reference stays loading until COS resolves and retains its remote URL', async () => {
  const upload = deferred();
  const f = fixture({ upload: () => upload.promise });
  const running = f.task.start();
  assert.equal(f.updates[0].uploadState, 'uploading');
  await new Promise(setImmediate);
  assert.equal(f.updates.at(-1).referencePath, null);
  upload.resolve({ url: 'https://fixture.example/saved.png' });
  await running;
  assert.deepEqual(f.updates.at(-1), {
    uploadState: 'ready',
    referencePath: 'https://fixture.example/saved.png',
  });
  assert.equal(f.counts().disposals, 0);
  await f.task.close();
  assert.equal(f.counts().disposals, 1);
});

test('failed reference retries with its copied file and coalesces repeated taps', async () => {
  let attempts = 0;
  const f = fixture({
    upload: async () => {
      if (++attempts === 1) throw Error('upload failed');
      return { url: 'https://fixture.example/retry.png' };
    },
  });
  await f.task.start();
  assert.equal(f.updates.at(-1).uploadState, 'failed');
  assert.equal(f.errors.length, 1);
  const retry = f.task.start();
  assert.equal(f.task.start(), retry);
  await retry;
  assert.equal(f.updates.at(-1).uploadState, 'ready');
  assert.deepEqual(f.counts(), { copies: 1, uploads: 2, disposals: 0 });
  await f.task.close();
});

test('exiting during image preparation removes the late copy without uploading', async () => {
  const preparation = deferred();
  const f = fixture({ prepare: () => preparation.promise });
  const running = f.task.start();
  const closing = f.task.close();
  preparation.resolve(f.file);
  await Promise.all([running, closing]);
  assert.deepEqual(f.counts(), { copies: 1, uploads: 0, disposals: 1 });
  assert.equal(f.updates.length, 1);
  await f.task.start();
  await f.task.close();
  assert.equal(f.counts().disposals, 1);
});

test('removing a reference aborts its upload and ignores a late COS result', async () => {
  const upload = deferred();
  let signal;
  const f = fixture({
    upload: (_, value) => {
      signal = value;
      return upload.promise;
    },
  });
  const running = f.task.start();
  await new Promise(setImmediate);
  const count = f.updates.length;
  const closing = f.task.close();
  assert.equal(signal.aborted, true);
  upload.resolve({ url: 'https://fixture.example/late.png' });
  await Promise.all([running, closing]);
  assert.equal(f.updates.length, count);
  assert.equal(f.errors.length, 0);
  assert.equal(f.counts().disposals, 1);
});

test('reference tasks isolate cancellation and retry failed preparation', async () => {
  let first = true;
  const a = fixture({
    prepare: file => {
      if (first) {
        first = false;
        throw Error('copy failed');
      }
      return file;
    },
  });
  const secondUpload = deferred();
  let secondSignal;
  const b = fixture({
    upload: (_, signal) => {
      secondSignal = signal;
      return secondUpload.promise;
    },
  });
  const secondRunning = b.task.start();
  await new Promise(setImmediate);
  await a.task.start();
  assert.equal(a.updates.at(-1).uploadState, 'failed');
  await a.task.start();
  await a.task.close();
  assert.equal(secondSignal.aborted, false);
  assert.equal(b.updates.at(-1).uploadState, 'uploading');
  secondUpload.resolve({ url: 'https://fixture.example/independent.png' });
  await secondRunning;
  assert.equal(b.updates.at(-1).uploadState, 'ready');
  assert.deepEqual(a.counts(), { copies: 2, uploads: 1, disposals: 1 });
  await b.task.close();
});
