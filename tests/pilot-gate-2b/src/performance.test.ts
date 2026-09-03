import { describe, expect, it } from 'vitest';

import { buildPerformanceReport, selectProductionTimeout } from './performance.js';

const context = {
  sourceCommit: 'a'.repeat(40),
  workflowRunId: 42,
  workflowRunAttempt: 1,
  edgeRegion: 'ap-southeast-1',
  projectRegion: 'ap-southeast-1',
} as const;

describe('hosted latency characterization', () => {
  it('selects the smallest production deadline with 25 percent headroom over the maximum', () => {
    expect(selectProductionTimeout([...Array(19).fill(1_100), 7_900])).toBe(10_000);
    expect(selectProductionTimeout([...Array(19).fill(1_100), 8_001])).toBe(12_000);
    expect(selectProductionTimeout([...Array(19).fill(1_100), 9_601])).toBe(15_000);
    expect(() => selectProductionTimeout([...Array(19).fill(1_100), 12_001]))
      .toThrow('hosted_characterization_requires_optimization');
  });

  it('rejects fewer than 20 successes and invalid latency values', () => {
    expect(() => selectProductionTimeout(Array(19).fill(1_000)))
      .toThrow('hosted_characterization_invalid');
    expect(() => selectProductionTimeout([...Array(19).fill(1_000), 30_001]))
      .toThrow('hosted_characterization_invalid');
    expect(() => selectProductionTimeout([...Array(19).fill(1_000), 1.5]))
      .toThrow('hosted_characterization_invalid');
  });

  it('reports aggregate nearest-rank latency and fixed outcomes without individual samples', () => {
    const report = buildPerformanceReport(
      context,
      Array.from({ length: 20 }, (_value, index) => index + 1),
      { success: 20, http_error: 0, transport_error: 0, timeout: 0 },
    );

    expect(report).toEqual({
      schemaVersion: 1,
      sourceCommit: 'a'.repeat(40),
      workflowRunId: 42,
      workflowRunAttempt: 1,
      edgeRegion: 'ap-southeast-1',
      projectRegion: 'ap-southeast-1',
      sampleCount: 20,
      outcomes: { success: 20, http_error: 0, transport_error: 0, timeout: 0 },
      observedErrorRate: 0,
      minMs: 1,
      p50Ms: 10,
      p95Ms: 19,
      maxMs: 20,
      sloP95Ms: 5_000,
      sloPassed: true,
      selectedTimeoutMs: 10_000,
    });
    expect(JSON.stringify(report)).not.toContain('[1,2,3');
  });

  it('reports the observed error rate without claiming a sub-one-percent SLO', () => {
    const report = buildPerformanceReport(
      context,
      Array(20).fill(4_100),
      { success: 20, http_error: 1, transport_error: 1, timeout: 0 },
    );

    expect(report.observedErrorRate).toBeCloseTo(2 / 22);
    expect(Object.hasOwn(report, 'errorRateSloPassed')).toBe(false);
  });
});
