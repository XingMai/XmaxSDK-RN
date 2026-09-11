const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { fileURLToPath } = require('node:url');
const { Module } = require('node:module');
const ts = require('typescript');

const filename = resolve(__dirname, '../Example/XLab/src/realtime/ReferenceImageCache.ts');
const compiledSource = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const firstURL = 'https://images.example.com/reference.jpg?version=1';
const secondURL = 'https://images.example.com/reference.jpg?version=2';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Run the real cache controller against a temporary filesystem. Replace only
// the Blob native boundary and network responses; never contact live services.
async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'xlab-image-cache-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const downloads = [];
  const native = {
    fs: {
      dirs: { CacheDir: directory },
      async stat(path) {
        const stat = await fs.stat(path);
        return { type: stat.isFile() ? 'file' : 'directory', size: String(stat.size) };
      },
      mkdir: path => fs.mkdir(path),
      exists: path => fs.access(path).then(() => true, () => false),
      unlink: path => fs.unlink(path),
      mv: (source, destination) => fs.rename(source, destination).then(() => true),
    },
    async respond() {
      return { status: 200, headers: { 'Content-Type': 'image/jpeg' } };
    },
    bytes: Buffer.from('image fixture'),
    config({ path }) {
      return {
        async fetch(method, uri) {
          assert.equal(method, 'GET');
          downloads.push(uri);
          await fs.writeFile(path, native.bytes);
          const info = await native.respond(uri);
          return { info: () => info };
        },
      };
    },
  };
  const module = new Module(filename);
  module.require = name => {
    assert.equal(name, 'react-native-blob-util');
    return { __esModule: true, default: native };
  };
  module._compile(compiledSource, filename);
  const Cache = module.exports.ReferenceImageCache;
  const create = () => new Cache(new Set([firstURL, secondURL]));
  return { directory, native, downloads, create, cache: create() };
}

test('reference cache survives a new instance and keeps different URLs separate', async t => {
  const { cache, create, downloads, native } = await fixture(t);
  const first = await cache.resolve(firstURL);
  assert.equal(cache.peek(firstURL), first);
  assert.deepEqual(await fs.readFile(fileURLToPath(first)), native.bytes);
  const second = await cache.resolve(secondURL);
  assert.notEqual(first, second);
  assert.equal(downloads.length, 2);
  native.respond = async () => { throw new Error('offline'); };
  assert.equal(await create().resolve(firstURL), first);
  assert.equal(await create().resolve(secondURL), second);
  assert.equal(downloads.length, 2);
  assert.equal(await cache.resolve('file:///picked.jpg'), 'file:///picked.jpg');
  assert.equal(await cache.resolve('https://other.example.com/private.jpg'), 'https://other.example.com/private.jpg');
  assert.equal(downloads.length, 2);
});

test('concurrent thumbnail loads share one download and never expose a partial file', async t => {
  const { cache, downloads, native, directory } = await fixture(t);
  const started = deferred(), finish = deferred();
  native.respond = async () => {
    started.resolve();
    await finish.promise;
    return { status: 200, headers: { 'content-type': 'image/png' } };
  };
  const first = cache.resolve(firstURL), second = cache.resolve(firstURL);
  assert.equal(first, second);
  await started.promise;
  assert.equal(cache.peek(firstURL), undefined);
  const folder = join(directory, 'xlab-reference-images-v1');
  assert((await fs.readdir(folder)).every(name => name.endsWith('.part')));
  finish.resolve();
  assert.equal(await first, await second);
  assert.equal(downloads.length, 1);
  assert((await fs.readdir(folder)).every(name => !name.endsWith('.part')));
});

test('failed, empty and non-image downloads are removed and can be retried', async t => {
  const { cache, native, directory, downloads } = await fixture(t);
  for (const failure of ['network', 'status', 'html', 'empty']) {
    native.bytes = failure === 'empty' ? Buffer.alloc(0) : Buffer.from('partial');
    native.respond = async () => {
      if (failure === 'network') throw new Error('offline');
      return {
        status: failure === 'status' ? 403 : 200,
        headers: { 'Content-Type': failure === 'html' ? 'text/html' : 'image/jpeg' },
      };
    };
    await assert.rejects(cache.resolve(firstURL));
    assert.equal(cache.peek(firstURL), undefined);
    assert.deepEqual(await fs.readdir(join(directory, 'xlab-reference-images-v1')), []);
  }
  native.bytes = Buffer.from('complete');
  native.respond = async () => ({ status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  const result = await cache.resolve(firstURL);
  assert.equal((await fs.readFile(fileURLToPath(result))).toString(), 'complete');
  assert.equal(downloads.length, 5);
});

test('missing or invalidated cache entries download again without affecting other images', async t => {
  const { cache, downloads } = await fixture(t);
  const first = await cache.resolve(firstURL);
  const second = await cache.resolve(secondURL);
  await fs.unlink(fileURLToPath(first));
  assert.equal(await cache.resolve(firstURL), first);
  await cache.invalidate(firstURL);
  assert.equal(cache.peek(firstURL), undefined);
  assert.equal(await cache.resolve(secondURL), second);
  assert.equal(downloads.length, 3);
  assert.equal(await cache.resolve(firstURL), first);
  assert.equal(downloads.length, 4);
});
