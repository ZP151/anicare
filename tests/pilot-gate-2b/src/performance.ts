const PRODUCTION_TIMEOUTS = [10_000, 12_000, 15_000] as const;
const COMMIT = /^[a-f0-9]{40}$/;
const REGION = 'ap-southeast-1';

export type ProductionTimeoutMs = typeof PRODUCTION_TIMEOUTS[number];
export type PerformanceContext = Readonly<{
  sourceCommit: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  edgeRegion: typeof REGION;
  projectRegion: typeof REGION;
}>;
export type PerformanceOutcomes = Readonly<{
  success: number;
  http_error: number;
  transport_error: number;
  timeout: number;
}>;
export type PerformanceReport = Readonly<{
  schemaVersion: 1;
  sourceCommit: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  edgeRegion: typeof REGION;
  projectRegion: typeof REGION;
  sampleCount: number;
  outcomes: PerformanceOutcomes;
  observedErrorRate: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  sloP95Ms: 5_000;
  sloPassed: boolean;
  selectedTimeoutMs: ProductionTimeoutMs;
}>;

function invalid(): never { throw new Error('hosted_characterization_invalid'); }

function validSamples(samples: readonly number[]): number[] {
  if (samples.length < 20 || samples.length > 100 || samples.some(
    (value) => !Number.isSafeInteger(value) || value < 0 || value > 30_000,
  )) return invalid();
  return [...samples].sort((left, right) => left - right);
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.ceil(sorted.length * fraction) - 1]!;
}

export function selectProductionTimeout(samples: readonly number[]): ProductionTimeoutMs {
  const sorted = validSamples(samples);
  const required = Math.ceil(sorted.at(-1)! * 1.25);
  const selected = PRODUCTION_TIMEOUTS.find((candidate) => candidate >= required);
  if (selected === undefined) throw new Error('hosted_characterization_requires_optimization');
  return selected;
}

export function buildPerformanceReport(
  context: PerformanceContext,
  samples: readonly number[],
  outcomes: PerformanceOutcomes,
): PerformanceReport {
  const sorted = validSamples(samples);
  if (!context || typeof context !== 'object' || !COMMIT.test(context.sourceCommit) ||
      !Number.isSafeInteger(context.workflowRunId) || context.workflowRunId < 1 ||
      !Number.isSafeInteger(context.workflowRunAttempt) || context.workflowRunAttempt < 1 ||
      context.edgeRegion !== REGION || context.projectRegion !== REGION) return invalid();
  const outcomeValues = Object.values(outcomes);
  if (Object.keys(outcomes).join(',') !== 'success,http_error,transport_error,timeout' ||
      outcomeValues.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      outcomes.success !== sorted.length) return invalid();
  const attempts = outcomeValues.reduce((sum, value) => sum + value, 0);
  if (attempts < sorted.length || attempts > 100) return invalid();
  const failures = attempts - outcomes.success;
  const p95Ms = percentile(sorted, 0.95);
  return {
    schemaVersion: 1,
    sourceCommit: context.sourceCommit,
    workflowRunId: context.workflowRunId,
    workflowRunAttempt: context.workflowRunAttempt,
    edgeRegion: context.edgeRegion,
    projectRegion: context.projectRegion,
    sampleCount: sorted.length,
    outcomes: { ...outcomes },
    observedErrorRate: failures / attempts,
    minMs: sorted[0]!,
    p50Ms: percentile(sorted, 0.5),
    p95Ms,
    maxMs: sorted.at(-1)!,
    sloP95Ms: 5_000,
    sloPassed: p95Ms <= 5_000,
    selectedTimeoutMs: selectProductionTimeout(sorted),
  };
}
