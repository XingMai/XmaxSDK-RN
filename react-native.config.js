module.exports = {
  dependency: {
    platforms: {
      ios: { podspecPath: 'XmaxReactNativeSDK.podspec' },
      android: {
        sourceDir: 'android',
        packageImportPath: 'import ai.xmax.reactnative.XmaxPackage;',
        packageInstance: 'new XmaxPackage()',
      },
    },
  },
};
