const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { Module } = require('node:module');
const ts = require('typescript');

function loadSource(filename) {
  const compiled = new Module(filename, module);
  compiled.require = name => name.startsWith('.')
    ? loadSource(resolve(dirname(filename), `${name}.ts`))
    : require(name);
  compiled._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}

const root = resolve(__dirname, '../Example/XLab/src/localization');
const { resolveLocale, translate } = loadSource(resolve(root, 'Localization.ts'));
const { english, simplifiedChinese } = loadSource(resolve(root, 'messages.ts'));

test('explicit UI language overrides the device locale and system preference follows supported locales', () => {
  assert.equal(resolveLocale('en', 'zh-CN'), 'en');
  assert.equal(resolveLocale('zh-Hans', 'en-US'), 'zh-Hans');
  for (const locale of ['zh', 'zh-CN', 'zh_Hans_CN', 'zh-TW']) {
    assert.equal(resolveLocale('system', locale), 'zh-Hans');
  }
  for (const locale of ['en-US', 'fr-FR', '', 'zhuang']) {
    assert.equal(resolveLocale('system', locale), 'en');
  }
});

test('XLab catalogs have matching complete keys and parameter sets', () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(simplifiedChinese).sort());
  for (const key of Object.keys(english)) {
    assert(english[key].trim(), key);
    assert(simplifiedChinese[key].trim(), key);
    assert.deepEqual(english[key].match(/\{\w+\}/g), simplifiedChinese[key].match(/\{\w+\}/g), key);
  }
  assert.equal(translate('en', 'feed.model.count', { count: 1 }), 'MODELS: 1');
  assert.equal(translate('zh-Hans', 'feed.model.count', { count: 1 }), '模型：1');
  assert.equal(translate('en', 'feed.camera.title'), 'Live Camera');
  assert.equal(translate('zh-Hans', 'feed.camera.title'), '摄像头实时流');
  assert(!/[\u3400-\u9fff]/.test(Object.values(english).join(' ')));
});

test('existing configuration errors can switch language without changing failure state', () => {
  const error = 'configuration.saveError';
  assert.equal(translate('zh-Hans', error), '配置保存失败，请重试。');
  assert.equal(translate('en', error), 'Unable to save configuration. Please retry.');
});


test('SDK errors and named progress parameters resolve in both interface languages', () => {
  const { errorMessageKey } = loadSource(resolve(root, 'ErrorMessages.ts'));
  for (const code of ['INVALID_API_KEY', 'CAMERA_PERMISSION_DENIED', 'MICROPHONE_PERMISSION_DENIED',
    'NETWORK_ERROR', 'TIMEOUT', 'UNSAFE_IMAGE', 'UPLOAD_ERROR', 'RTC_ERROR']) {
    const key = errorMessageKey(code);
    assert.equal(typeof english[key], 'string');
    assert.notEqual(translate('en', key), translate('zh-Hans', key));
  }
  assert.equal(errorMessageKey('NEW_VENDOR_ERROR'), 'error.internal');
  assert.equal(errorMessageKey('toString'), 'error.internal');
  assert.equal(translate('en', 'storage.upload.progress', { percent: 42 }), 'Uploading 42%');
  assert.equal(translate('zh-Hans', 'storage.upload.progress', { percent: 42 }), '上传中 42%');
  assert.equal(translate('en', 'realtime.reference.failedLabel', { title: 'My reference' }),
    'My reference, upload failed. Tap to retry');
});
