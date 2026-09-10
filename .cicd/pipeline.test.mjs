import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  releaseBlockers,
  replaceVersion,
  validateVersion,
  verifyPackageFiles,
} from './pipeline.mjs';

test('npm versions reject leading zeroes, path inputs and build metadata', () => {
  for (const version of ['0.0.1', '1.2.3', '1.0.0-beta.0', '1.0.0-rc.2'])
    assert.equal(validateVersion(version), version);
  for (const version of [
    undefined,
    '../1.0.0',
    '01.0.0',
    '1.0.0-01',
    '1.0.0+',
    '1.0.0+build.1',
    'v1.0.0',
    '--help',
  ])
    assert.throws(() => validateVersion(version));
});

test('version replacement fails on missing or ambiguous runtime fields', () => {
  const pattern = /(sdk_version: ')[^']+(')/;
  assert.equal(
    replaceVersion("sdk_version: '0.0.1',", pattern, '1.2.3'),
    "sdk_version: '1.2.3',",
  );
  assert.throws(() => replaceVersion('no version', pattern, '1.2.3'));
  assert.throws(() =>
    replaceVersion("sdk_version: '1', sdk_version: '2'", pattern, '1.2.3'),
  );
});

test('release blocks private packages, missing authorization metadata and development patches', () => {
  const manifests = [{ package: 'vendor', version: '1.2.3' }];
  const blocked = releaseBlockers(
    {
      private: true,
      license: 'UNLICENSED',
      peerDependencies: { vendor: '1.2.3' },
    },
    manifests,
    false,
  );
  assert.equal(blocked.length, 4);
  assert.deepEqual(
    releaseBlockers(
      {
        license: 'SEE LICENSE IN LICENSE',
        peerDependencies: { vendor: '1.2.4' },
      },
      manifests,
      true,
    ),
    [],
  );
  assert.ok(
    releaseBlockers(
      { license: 'MIT', dependencies: { vendor: 'file:../vendor' } },
      [],
      true,
    ).length,
  );
});

test('package inspection catches absent Codegen sources, entrypoints and leaked development files', () => {
  const pkg = {
    main: 'lib/commonjs/index.js',
    module: 'lib/module/index.js',
    types: 'lib/typescript/index.d.ts',
    'react-native': 'src/index.ts',
    codegenConfig: { jsSrcsDir: 'src/Foundation/Native' },
  };
  const files = [
    pkg.main,
    pkg.module,
    pkg.types,
    pkg['react-native'],
    'package.json',
    'README.md',
    'react-native.config.js',
    'XmaxReactNativeSDK.podspec',
    'android/build.gradle',
    'ios/XmaxRuntime.mm',
    'android/src/XmaxRuntime.kt',
    'src/Foundation/Native/NativeXmaxRuntime.ts',
  ];
  verifyPackageFiles(files, pkg);
  assert.throws(() => verifyPackageFiles(files.slice(1), pkg));
  assert.throws(() => verifyPackageFiles(files.slice(0, -1), pkg));
  for (const leaked of [
    '.npmrc',
    '.env.production',
    'Example/key.json',
    'ios/build/cache',
    'signing.p12',
  ]) {
    assert.throws(() => verifyPackageFiles([...files, leaked], pkg));
  }
});

test('release readiness refusal happens before network, build or npm publication', () => {
  const directory = mkdtempSync(join(tmpdir(), 'xmax-cicd-test-'));
  try {
    const command = (name, args) => {
      const result = spawnSync(name, args, {
        cwd: directory,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    };
    const write = (path, value) => {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), value);
    };
    write('.cicd/placeholder', '');
    copyFileSync(
      fileURLToPath(new URL('./pipeline.mjs', import.meta.url)),
      join(directory, '.cicd/pipeline.mjs'),
    );
    write(
      'package.json',
      JSON.stringify({ name: '@xmax/test', version: '0.0.1', private: true }),
    );
    write(
      'package-lock.json',
      JSON.stringify({
        version: '0.0.1',
        packages: { '': { version: '0.0.1' } },
      }),
    );
    write(
      'src/index.ts',
      "export const XmaxSDKInfo = Object.freeze({ version: '0.0.1' });",
    );
    write('src/Core/XmaxClient.ts', "sdk_version: '0.0.1'");
    write('src/Foundation/RTC/RtcManager.ts', "sdk_version: '0.0.1'");
    command('git', ['init', '--quiet', '--initial-branch=main']);
    command('git', ['add', '.']);
    command('git', [
      '-c',
      'user.name=CI Test',
      '-c',
      'user.email=ci@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'test fixture',
    ]);
    const result = spawnSync(
      process.execPath,
      ['.cicd/pipeline.mjs', 'release', '0.0.1', '--publish'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /private=true/);
    assert.doesNotMatch(result.stderr, /origin|npm failed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
