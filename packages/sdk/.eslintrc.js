module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    // SDK-specific rules
    'no-console': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
  ignorePatterns: ['src/generated/**', 'dist/**', 'scripts/**'],
};