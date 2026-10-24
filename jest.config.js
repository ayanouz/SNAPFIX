module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/supabase/functions/'],
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    'src/services/**/*.{ts,tsx}',
    'src/utils/**/*.{ts,tsx}',
    '!src/services/supabase/**',
    '!src/services/demo/demoRepository.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 30,
      functions: 35,
      lines: 40,
    },
  },
};
