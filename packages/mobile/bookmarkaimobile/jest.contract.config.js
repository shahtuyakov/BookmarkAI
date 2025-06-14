module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__contracts__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@bookmarkai/test-matchers$': '<rootDir>/../../shared/test-matchers/src/index.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.contract.setup.js'],
  testTimeout: 30000,
};
