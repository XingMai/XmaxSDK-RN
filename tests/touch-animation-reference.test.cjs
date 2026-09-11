const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Module } = require('node:module');
const ts = require('typescript');
const files = { dirs: { CacheDir: '/fixture/cache' }, cp: async () => {}, unlink: async () => {} };
mock.module('react-native-blob-util', { defaultExport: { fs: files } });
const filename = path.resolve(__dirname, '../Example/XLab/src/realtime/TouchAnimationReference.ts');
const compiled = new Module(filename, module);
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { uploadTouchAnimationReference } = compiled.exports;

test('touch image upload uses original bytes/MIME and cleans only its owned copy', async t => {
  const copies = [], removed = [];
  t.mock.method(files, 'cp', async (...args) => copies.push(args));
  t.mock.method(files, 'unlink', async file => removed.push(file));
  const signal = new AbortController().signal;
  const result = await uploadTouchAnimationReference({ uploadImage: async options => {
    assert.equal(options.contentType, 'image/png');
    assert.equal(options.signal, signal);
    assert.equal(options.fileURL, `file://${copies[0][1]}`);
    return { url: 'https://fixture.example/original.png' };
  } }, 'file:///input/my%20image.png', 'image/png', signal);
  assert.equal(result, 'https://fixture.example/original.png');
  assert.equal(copies[0][0], '/input/my image.png');
  assert.deepEqual(removed, [copies[0][1]]);
});

test('cancelling a pending copy prevents upload and cleans the late file', async t => {
  let finish;
  const removed = [];
  t.mock.method(files, 'cp', () => new Promise(resolve => { finish = resolve; }));
  t.mock.method(files, 'unlink', async file => removed.push(file));
  let uploads = 0;
  const abort = new AbortController();
  const running = uploadTouchAnimationReference({ uploadImage: async () => { uploads++; } }, 'content://picker/image', 'image/png', abort.signal);
  abort.abort(); finish();
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(uploads, 0);
  assert.equal(removed.length, 1);
  assert.match(removed[0], /^\/fixture\/cache\/xlab-touch-/);
});

test('failed COS upload releases its temporary source', async t => {
  const removed = [];
  t.mock.method(files, 'unlink', async file => removed.push(file));
  await assert.rejects(uploadTouchAnimationReference({ uploadImage: async () => { throw Error('COS failed'); } }, 'file:///input/photo.jpg', 'image/jpeg', new AbortController().signal), /COS failed/);
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0], '/input/photo.jpg');
});
