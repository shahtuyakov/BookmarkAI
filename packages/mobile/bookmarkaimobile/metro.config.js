/* eslint-env node */
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for React Native 0.79.2 with PNPM monorepo support
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
    // PNPM monorepo node modules resolution
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../../sdk/node_modules'),
      path.resolve(__dirname, '../../../node_modules'), // Root node_modules for hoisted packages
    ],
    // Alias for workspace packages
    alias: {
      '@bookmarkai/sdk': path.resolve(__dirname, '../../sdk'),
    },
  },
  watchFolders: [
    // Watch the entire monorepo for changes
    path.resolve(__dirname, '../../..'),
  ],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);