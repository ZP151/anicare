const MAX_SCENARIO_LENGTH = 64;
const MAX_ERROR_LENGTH = 96;
const MAX_COUNT = 1_000;

type Diagnostic = Record<string, string | number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsSecret(value: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => secret.length > 0 && value.includes(secret));
}

function boundedScenario(value: unknown, secrets: readonly string[]): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SCENARIO_LENGTH ||
    !/^[a-z0-9][a-z0-9-]*$/.test(value) ||
    containsSecret(value, secrets)
  ) {
    return undefined;
  }
  return value;
}

function boundedError(value: unknown, secrets: readonly string[]): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (containsSecret(value, secrets)) return '[redacted]';
  if (value.length === 0 || value.length > MAX_ERROR_LENGTH || !/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(value)) {
    return '[redacted]';
  }
  return value;
}

function boundedStatus(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 100 || value > 599) return undefined;
  return value;
}

function boundedCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_COUNT) return undefined;
  return value;
}

function sanitizeRecord(value: Record<string, unknown>, secrets: readonly string[]): Diagnostic {
  const result: Diagnostic = {};
  const scenario = boundedScenario(value.scenario, secrets);
  const status = boundedStatus(value.status);
  const error = boundedError(value.error, secrets);
  const count = boundedCount(value.count);

  if (scenario !== undefined) result.scenario = scenario;
  if (status !== undefined) result.status = status;
  if (error !== undefined) result.error = error;
  if (count !== undefined) result.count = count;
  return result;
}

export function sanitizeDiagnostic(value: unknown, secrets: readonly string[]): string {
  return JSON.stringify(isRecord(value) ? sanitizeRecord(value, secrets) : {});
}
