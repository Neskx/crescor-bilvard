import { defineConfig } from 'vitest/config';

// Database integration tests. Require the local Supabase stack:
//   npx supabase start   →   npm run test:db
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
