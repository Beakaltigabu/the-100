import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration suites share the `the100_test` schema (each file migrates
    // it and resets tables in beforeEach). Files MUST run sequentially so they
    // never clobber each other's state.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 40000
  }
});