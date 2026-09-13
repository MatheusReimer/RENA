import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests only for now. Integration tests (SPEC 43) need a live
    // Postgres and run under a separate project once DATABASE_URL is set.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
