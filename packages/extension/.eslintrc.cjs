/* eslint-env node */
module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    browser: true,
    webextensions: true,
    es2020: true,
  },
  plugins: ['react', 'react-hooks'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  settings: {
    react: {
      version: '18.2',
    },
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
}; 