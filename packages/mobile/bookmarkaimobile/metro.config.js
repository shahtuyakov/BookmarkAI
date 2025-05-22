const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  transformer: {
    // Enable Hermes transforms for better performance
    hermesCommand: 'hermes',
    enableBabelRCLookup: false,
    unstable_allowRequireContext: true,
  },
  resolver: {
    // Support New Architecture module resolution
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['react-native', 'browser', 'require'],
  },
  serializer: {
    // Optimize bundle for New Architecture
    customSerializer: require('@react-native/metro-serializer'),
  },
  server: {
    // Enhanced development server for debugging
    rewriteRequestUrl: (url) => {
      if (!url.endsWith('.bundle')) {
        return url;
      }
      // Enable source maps for better debugging
      return url + '?platform=ios&dev=true&minify=false&modulesOnly=false&runModule=true';
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);