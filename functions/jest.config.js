// jest.config.js — add this to your functions/ folder

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  // Give emulator calls time to respond
  testTimeout: 30000,
  // Run test files sequentially (emulator state is shared)
  maxWorkers: 1,
  globalSetup: "<rootDir>/src/tests/globalSetup.ts",
  verbose: true,
};