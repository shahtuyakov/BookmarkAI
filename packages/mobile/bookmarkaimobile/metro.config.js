const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration for React Native 0.79.2
 */
const config = {
  transformer: {
    // Enable Hermes transforms
    hermesCommand: 'hermesc',
    enableBabelRCLookup: false,
  },
  resolver: {
    // New Architecture module resolution
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['react-native', 'browser', 'require'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);