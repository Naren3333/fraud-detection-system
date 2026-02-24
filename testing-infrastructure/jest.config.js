// jest.config.js - Root Jest Configuration

module.exports = {
  // Test environment
  testEnvironment: "node",

  // Coverage configuration
  collectCoverageFrom: [
    "../decision-engine-service/src/**/*.{js,jsx}",
    "../transaction-service/src/**/*.{js,jsx}",
    "!**/*.test.{js,jsx}",
    "!**/*.spec.{js,jsx}",
    "!**/index.js",
    "!**/__tests__/**",
  ],

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },

  coverageReporters: ["text", "text-summary", "html", "lcov", "json"],

  // Test match patterns
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],

  // Module paths
  modulePaths: ["<rootDir>"],

  // Transform (for ES6 modules)
  transform: {
    "^.+\\.jsx?$": "babel-jest",
  },

  // Test timeout
  testTimeout: 10000,

  // Ignore patterns
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/build/"],

  // Verbose output
  verbose: true,

  // Projects for different test types
  projects: [
    {
      displayName: "unit",
      testMatch: ["<rootDir>/unit/**/*.test.js"],
      testEnvironment: "node",
    },
    {
      displayName: "integration",
      testMatch: ["<rootDir>/integration/**/*.test.js"],
      testEnvironment: "node",
    },
  ],

  // Maximum workers (parallel tests)
  maxWorkers: "50%",

  // Bail on first failure (useful for CI)
  bail: false,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
