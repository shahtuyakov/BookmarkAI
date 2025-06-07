const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for React Native 0.79.2 with local SDK package support
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
    // Add SDK package to node modules map
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../../sdk/node_modules'),
    ],
  },
  watchFolders: [
    // Watch the SDK package for changes
    path.resolve(__dirname, '../../sdk'),
  ],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);