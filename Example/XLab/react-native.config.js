module.exports = {
  dependencies: {
    'react-native-cos-sdk-nobeacon': {
      platforms: {
        ios: {
          podspecPath: require('node:path').resolve(
            __dirname,
            '../../node_modules/react-native-cos-sdk-nobeacon/react-native-cos-sdk-nobeacon.podspec',
          ),
        },
      },
    },
  },
};
