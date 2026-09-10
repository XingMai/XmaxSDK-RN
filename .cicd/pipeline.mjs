import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'https://registry.npmjs.org/';
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const fail = message => {
  throw new Error(message);
};

/** Runs argv directly, without shell expansion or logging authentication values. */
function run(command, args, cwd = root, capture = false, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    fail(`${command} failed (${result.status ?? result.signal}).`);
  return capture ? result.stdout.trim() : '';
}

const git = (...args) => run('git', args, root, true);

/** npm release versions exclude build metadata, which is not a distinct npm version. */
export function validateVersion(version) {
  const numeric = '(0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  if (
    !new RegExp(
      `^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`,
    ).test(version ?? '')
  ) {
    fail(`Invalid npm version: ${version ?? '<missing>'}`);
  }
  return version;
}

function clean() {
  if (git('status', '--porcelain'))
    fail('Commit or stash working changes before this operation.');
}

function feature() {
  const branch = git('branch', '--show-current');
  if (!branch.startsWith('feature/'))
    fail('Run from the feature/* branch being prepared.');
  return branch;
}

/** Replaces exactly one version field; changed source layouts require explicit review. */
export function replaceVersion(source, pattern, version) {
  const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
  if (matches.length !== 1) fail('Expected exactly one SDK version field.');
  return source.replace(
    pattern,
    (_, prefix, suffix) => `${prefix}${version}${suffix}`,
  );
}

const versionFields = [
  ['src/index.ts', /(XmaxSDKInfo = Object\.freeze\(\{ version: ')[^']+(')/],
  ['src/Core/XmaxClient.ts', /(sdk_version: ')[^']+(')/],
  ['src/Foundation/RTC/RtcManager.ts', /(sdk_version: ')[^']+(')/],
];

function verifyVersions(source) {
  const pkg = readJSON(join(source, 'package.json'));
  validateVersion(pkg.version);
  const lock = readJSON(join(source, 'package-lock.json'));
  if (
    lock.version !== pkg.version ||
    lock.packages[''].version !== pkg.version
  ) {
    fail('package.json and package-lock.json versions differ.');
  }
  for (const [file, pattern] of versionFields) {
    const content = readFileSync(join(source, file), 'utf8');
    if (replaceVersion(content, pattern, pkg.version) !== content)
      fail(`Version mismatch: ${file}`);
  }
  return pkg;
}

function prepare(version) {
  validateVersion(version);
  feature();
  clean();
  if (
    git('tag', '--list', version) ||
    git('ls-remote', '--tags', 'origin', `refs/tags/${version}`)
  ) {
    fail(`Tag ${version} already exists.`);
  }
  // Validate all replacements before touching the working tree.
  const changes = versionFields.map(([file, pattern]) => [
    file,
    replaceVersion(readFileSync(join(root, file), 'utf8'), pattern, version),
  ]);
  run('npm', [
    'version',
    version,
    '--no-git-tag-version',
    '--ignore-scripts',
    '--allow-same-version',
  ]);
  for (const [file, content] of changes)
    writeFileSync(join(root, file), content);
  // The podspec reads the npm version. Let CocoaPods calculate its checksum and lock entry.
  run(
    'bundle',
    ['exec', 'pod', 'install', '--no-repo-update'],
    join(root, 'Example/XLab/ios'),
  );
  verifyVersions(root);
  run('git', ['diff', '--check']);
  console.log(
    `Prepared ${version}. Review package/lock/source/Podfile.lock changes, then commit and push.`,
  );
}

function jsChecks(source, install = true) {
  if (install) run('npm', ['ci'], source);
  verifyVersions(source);
  for (const script of ['typecheck', 'lint', 'format:check'])
    run('npm', ['run', script], source);
  run('npm', ['test'], source);
  run(process.execPath, ['--test', '.cicd/pipeline.test.mjs'], source);
}

/** Builds iPhoneOS without signing and Android Debug/Release; never launches a device. */
function nativeChecks(source, output, installRuby = false) {
  const app = join(source, 'Example/XLab');
  const rubyEnvironment = installRuby
    ? { BUNDLE_FROZEN: 'true', BUNDLE_PATH: join(source, 'vendor/bundle') }
    : {};
  run(
    'bundle',
    [installRuby ? 'install' : 'check'],
    source,
    false,
    rubyEnvironment,
  );
  run(
    'bundle',
    ['exec', 'pod', 'install', '--deployment', '--no-repo-update'],
    join(app, 'ios'),
    false,
    rubyEnvironment,
  );
  for (const configuration of ['Debug', 'Release']) {
    run(
      'xcodebuild',
      [
        '-quiet',
        '-workspace',
        join(app, 'ios/XLab.xcworkspace'),
        '-scheme',
        'XLab',
        '-configuration',
        configuration,
        '-destination',
        'generic/platform=iOS',
        '-derivedDataPath',
        join(output, 'DerivedData'),
        'CODE_SIGNING_ALLOWED=NO',
        'build',
      ],
      source,
    );
  }
  run(
    'bash',
    ['./gradlew', '--no-daemon', ':app:assembleDebug', ':app:assembleRelease'],
    join(app, 'android'),
  );
}

/** Inspects the actual tarball listing, including entrypoints, native sources and Codegen inputs. */
export function verifyPackageFiles(paths, pkg) {
  const required = [
    pkg.main,
    pkg.module,
    pkg.types,
    pkg['react-native'],
    'package.json',
    'README.md',
    'react-native.config.js',
    'XmaxReactNativeSDK.podspec',
    'android/build.gradle',
  ];
  for (const file of required)
    if (!file || !paths.includes(file.replace(/^\.\//, '')))
      fail(`Missing packed entry: ${file}`);
  for (const prefix of [
    'ios/',
    'android/src/',
    `${pkg.codegenConfig.jsSrcsDir}/`,
  ]) {
    if (!paths.some(file => file.startsWith(prefix)))
      fail(`Missing packed sources: ${prefix}`);
  }
  for (const file of paths) {
    if (
      /(^|\/)(?:node_modules|Example|vendor-patches|\.git|\.cicd|Pods|build|\.gradle|\.cxx)(\/|$)/.test(
        file,
      ) ||
      /(^|\/)\.env(?:\.|$)|(^|\/)\.npmrc$|\.(?:keystore|p12|mobileprovision|tgz)$/.test(
        file,
      )
    ) {
      fail(`Unexpected file in npm package: ${file}`);
    }
  }
}

function pack(source, output) {
  mkdirSync(output, { recursive: true });
  // jsChecks already built the package. Avoid rebuilding or corrupting JSON with lifecycle output.
  const [info] = JSON.parse(
    run(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', output],
      source,
      true,
    ),
  );
  const tarball = join(output, info.filename);
  const paths = run('tar', ['-tzf', tarball], source, true)
    .split('\n')
    .map(path => path.replace(/^package\//, ''));
  const pkg = JSON.parse(
    run('tar', ['-xOf', tarball, 'package/package.json'], source, true),
  );
  verifyPackageFiles(paths, pkg);
  writeJSON(join(output, 'pack.json'), info);
  return tarball;
}

function check(jsOnly, install = true) {
  const output = join(root, 'artifacts', `ci-${Date.now()}`);
  jsChecks(root, install);
  pack(root, output);
  if (!jsOnly) nativeChecks(root, output);
  run('git', ['diff', '--check']);
  console.log(
    `Checks passed (${
      jsOnly
        ? 'JS and package only; native checks not run'
        : 'JS, package and native builds'
    }). Artifacts: ${output}`,
  );
}

/** Local development patches cannot serve as a published consumer dependency strategy. */
export function releaseBlockers(pkg, manifests, hasLicense) {
  const blockers = [];
  if (pkg.private === true)
    blockers.push('package.json still has private=true');
  if (!hasLicense)
    blockers.push('a nonempty LICENSE or LICENSE.md is required');
  if (!pkg.license || pkg.license === 'UNLICENSED')
    blockers.push('set the intended SDK license metadata');
  if (pkg.publishConfig?.registry && pkg.publishConfig.registry !== registry)
    blockers.push(
      'publishConfig.registry must target the official npm registry',
    );
  if (pkg.publishConfig?.access && pkg.publishConfig.access !== 'public')
    blockers.push('publishConfig.access must be public');
  const dependencies = { ...pkg.dependencies, ...pkg.peerDependencies };
  for (const [name, spec] of Object.entries(dependencies)) {
    if (!/^(?:\d|[~^*><=]|npm:)/.test(spec))
      blockers.push(`${name}: use a registry dependency, not ${spec}`);
  }
  for (const manifest of manifests) {
    const spec = dependencies[manifest.package];
    if (spec && !/^(?:npm:.+@)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(spec)) {
      blockers.push(
        `${manifest.package}: pin the reviewed vendor revision exactly`,
      );
    }
    if (dependencies[manifest.package] === manifest.version) {
      blockers.push(
        `${manifest.package}@${manifest.version} still requires repository-only patches`,
      );
    }
  }
  return blockers;
}

function assertReleaseReady(source) {
  const patchDir = join(source, 'vendor-patches');
  const manifests = existsSync(patchDir)
    ? readdirSync(patchDir)
        .filter(file => file.endsWith('.json'))
        .map(file => readJSON(join(patchDir, file)))
    : [];
  const hasLicense = ['LICENSE', 'LICENSE.md'].some(
    file =>
      existsSync(join(source, file)) &&
      readFileSync(join(source, file), 'utf8').trim(),
  );
  const blockers = releaseBlockers(
    readJSON(join(source, 'package.json')),
    manifests,
    hasLicense,
  );
  if (blockers.length)
    fail(`Release prerequisites are incomplete:\n- ${blockers.join('\n- ')}`);
}

function merge(push) {
  const branch = feature();
  clean();
  git('fetch', 'origin', '--prune');
  const commit = git('rev-parse', 'HEAD');
  const targets = ['develop', 'main'];
  const verify = () => {
    if (git('rev-parse', `refs/remotes/origin/${branch}`) !== commit)
      fail('Push the feature branch first.');
    const worktrees = git('worktree', 'list', '--porcelain');
    for (const target of targets) {
      const remoteCommit = git('rev-parse', `refs/remotes/origin/${target}`);
      git('merge-base', '--is-ancestor', remoteCommit, commit);
      if (git('rev-parse', `refs/heads/${target}`) !== remoteCommit)
        fail(`Local ${target} differs from origin/${target}.`);
      if (worktrees.split('\n').includes(`branch refs/heads/${target}`))
        fail(`${target} is checked out in another worktree.`);
    }
  };
  verify();
  check(false);
  clean();
  git('fetch', 'origin', '--prune');
  if (git('rev-parse', 'HEAD') !== commit) fail('HEAD changed during checks.');
  verify();
  if (!push) {
    console.log(
      'Merge checks passed. Re-run with --push to atomically fast-forward origin/develop and origin/main.',
    );
    return;
  }
  run('git', [
    'push',
    '--atomic',
    'origin',
    ...targets.map(target => `${commit}:refs/heads/${target}`),
  ]);
  for (const target of targets) git('branch', '-f', target, commit);
  console.log(`develop and main now match ${branch} at ${commit}.`);
}

/** Copies only source-controlled application inputs into a separate npm consumer workspace. */
function consumer(source, tarball, destination, output) {
  mkdirSync(destination, { recursive: true });
  const files = run(
    'git',
    ['ls-files', '-z', '--', 'Example/XLab', 'Gemfile', 'Gemfile.lock'],
    source,
    true,
  )
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    mkdirSync(dirname(join(destination, file)), { recursive: true });
    copyFileSync(join(source, file), join(destination, file));
  }
  const pkg = readJSON(join(source, 'package.json'));
  writeJSON(join(destination, 'package.json'), {
    name: 'xmax-npm-consumer',
    version: '0.0.0',
    private: true,
    workspaces: ['Example/XLab'],
    devDependencies: pkg.devDependencies,
  });
  copyFileSync(tarball, join(destination, 'sdk.tgz'));
  const appPackagePath = join(destination, 'Example/XLab/package.json');
  const appPackage = readJSON(appPackagePath);
  appPackage.dependencies[pkg.name] = 'file:../../sdk.tgz';
  writeJSON(appPackagePath, appPackage);
  const tsconfigPath = join(destination, 'Example/XLab/tsconfig.json');
  const tsconfig = readJSON(tsconfigPath);
  delete tsconfig.compilerOptions.paths;
  writeJSON(tsconfigPath, tsconfig);
  const gradlePath = join(destination, 'Example/XLab/android/app/build.gradle');
  const gradle = readFileSync(gradlePath, 'utf8');
  if (!gradle.includes('def enableProguardInReleaseBuilds = false'))
    fail('Review consumer R8 configuration.');
  writeFileSync(
    gradlePath,
    gradle.replace(
      'def enableProguardInReleaseBuilds = false',
      'def enableProguardInReleaseBuilds = true',
    ),
  );
  // Resolve a fresh consumer lock, then exercise npm ci. No root prepare script or patches are copied.
  run(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts'],
    destination,
  );
  run('npm', ['ci'], destination);
  const installed = realpathSync(join(destination, 'node_modules', pkg.name));
  if (!installed.startsWith(`${realpathSync(destination)}${sep}`))
    fail('Consumer SDK resolved outside its workspace.');
  if (readJSON(join(installed, 'package.json')).version !== pkg.version)
    fail('Consumer SDK version mismatch.');
  run(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '-p',
      'Example/XLab/tsconfig.json',
    ],
    destination,
  );
  nativeChecks(destination, join(output, 'consumer'), true);
  copyFileSync(
    join(destination, 'package-lock.json'),
    join(output, 'consumer-package-lock.json'),
  );
  copyFileSync(
    join(destination, 'Example/XLab/ios/Podfile.lock'),
    join(output, 'consumer-Podfile.lock'),
  );
}

function release(version, tag, publish) {
  validateVersion(version);
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) fail('Invalid npm dist-tag.');
  if (version.includes('-') && tag === 'latest')
    fail('Use --tag beta (or another prerelease tag) for a prerelease.');
  clean();
  if (git('branch', '--show-current') !== 'main')
    fail('Run release from main.');
  if (verifyVersions(root).version !== version)
    fail('Requested version differs from package.json.');
  assertReleaseReady(root);
  const notes = join(root, '.cicd/release-notes', `${version}.md`);
  if (!existsSync(notes) || !readFileSync(notes, 'utf8').trim())
    fail(`Write release notes: ${notes}`);
  git('fetch', 'origin', 'main', '--tags');
  const commit = git('rev-parse', 'HEAD');
  if (
    git('rev-parse', 'origin/main') !== commit ||
    git('rev-parse', `refs/tags/${version}^{commit}`) !== commit
  )
    fail('main, origin/main and release tag must match.');
  const remoteTags = git(
    'ls-remote',
    'origin',
    `refs/tags/${version}`,
    `refs/tags/${version}^{}`,
  )
    .split('\n')
    .filter(Boolean);
  const remoteCommit =
    remoteTags.find(line => line.endsWith('^{}'))?.split(/\s/)[0] ??
    remoteTags[0]?.split(/\s/)[0];
  if (remoteCommit !== commit) fail('Push the matching release tag first.');
  const temporary = mkdtempSync(join(tmpdir(), 'xmax-rn-release-'));
  const output = join(root, 'artifacts', `release-${version}-${Date.now()}`);
  mkdirSync(output, { recursive: true });
  try {
    // A local clone contains only committed files and does not change the user's checkout.
    const source = join(temporary, 'source');
    run('git', [
      'clone',
      '--quiet',
      '--no-hardlinks',
      '--no-checkout',
      root,
      source,
    ]);
    run('git', ['checkout', '--quiet', '--detach', commit], source);
    jsChecks(source);
    const tarball = pack(source, output);
    consumer(source, tarball, join(temporary, 'consumer'), output);
    const sha256 = createHash('sha256')
      .update(readFileSync(tarball))
      .digest('hex');
    copyFileSync(notes, join(output, 'release-notes.md'));
    writeJSON(join(output, 'release.json'), {
      version,
      tag,
      commit,
      registry,
      sha256,
      tarball: relative(output, tarball),
      consumer: 'iOS Debug/Release + Android Debug/R8 Release',
      deviceAcceptance:
        'Must be recorded separately; builds do not verify RTC or cloud behavior.',
    });
    console.log(`Verified npm artifact: ${tarball}\nSHA-256: ${sha256}`);
    if (publish) {
      run('npm', ['whoami', '--registry', registry], temporary);
      run(
        'npm',
        [
          'publish',
          tarball,
          '--access',
          'public',
          '--tag',
          tag,
          '--registry',
          registry,
          '--ignore-scripts',
        ],
        temporary,
      );
      console.log(`Published ${version} with dist-tag ${tag}.`);
    } else
      console.log(
        'Validation complete. No registry changes were made. Use --publish to validate and publish.',
      );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const help = `Usage:
  .cicd/ci-prepare.sh <version>
  .cicd/ci-check.sh [--js-only] [--skip-install]
  .cicd/ci-merge.sh [--push]
  .cicd/cd-npm-release.sh <version> [--tag beta|latest] [--publish]

prepare changes local version fields; merge pushes only with --push;
release publishes only with --publish. See .cicd/README.md for prerequisites.`;

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return console.log(help);
  if (command === 'prepare' && args.length === 1) return prepare(args[0]);
  if (
    command === 'check' &&
    args.every(arg => ['--js-only', '--skip-install'].includes(arg))
  )
    return check(args.includes('--js-only'), !args.includes('--skip-install'));
  if (command === 'merge' && args.every(arg => arg === '--push'))
    return merge(args.includes('--push'));
  if (command === 'release') {
    const [version, ...options] = args;
    let tag = version?.includes('-') ? 'beta' : 'latest';
    let publish = false;
    while (options.length) {
      const option = options.shift();
      if (option === '--publish') publish = true;
      else if (option === '--tag' && options.length) tag = options.shift();
      else fail(help);
    }
    return release(version, tag, publish);
  }
  fail(help);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`CI/CD: ${error.message}`);
    process.exitCode = 1;
  }
}
