import { defineConfig } from 'vitest/config';

if (process.env.PILOT_GATE_2A !== '1') {
  throw new Error('PILOT_GATE_2A=1 is required to run Pilot Gate 2A integration tests.');
}

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    setupFiles: ['./src/integration-setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
