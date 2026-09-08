import { defineConfig } from 'vitest/config';

if (process.env.PILOT_GATE_2B !== '1') {
  throw new Error('PILOT_GATE_2B=1 is required to run Pilot Gate 2B integration tests.');
}

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
