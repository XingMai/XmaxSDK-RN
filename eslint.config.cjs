const reactNative = require('@react-native/eslint-config/flat');
module.exports = [
  { ignores: ['lib/**', 'docs/**', '**/Pods/**', '**/build/**', 'vendor/**'] },
  // This project uses TypeScript; do not enable the template's Flow-only rules.
  ...reactNative.filter(config => !config.plugins?.['ft-flow']),
  {
    files: ['Example/XLab/*.js'],
    languageOptions: { parserOptions: { requireConfigFile: false } },
  },
];
