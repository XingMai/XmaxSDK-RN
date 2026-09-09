const reactNative = require('@react-native/eslint-config/flat');
module.exports = [
  { ignores: ['lib/**', 'docs/**', '**/Pods/**', '**/build/**', 'vendor/**'] },
  // This project uses TypeScript; do not enable the template's Flow-only rules.
  ...reactNative.filter(config => !config.plugins?.['ft-flow']),
  {rules: {'no-void': ['error', {allowAsStatement: true}]}},
  // UUID encoding and the public logging bitmask intentionally use bitwise operations.
  {files: ['src/Foundation/Runtime/RuntimeInfo.ts', 'src/Core/XmaxClient.ts'], rules: {'no-bitwise': 'off'}},
  {
    files: ['Example/XLab/*.js'],
    languageOptions: { parserOptions: { requireConfigFile: false } },
  },
];
