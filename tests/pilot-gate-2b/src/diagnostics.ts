const STAGES = new Set(['validate', 'configure', 'deploy', 'create', 'checks', 'cleanup', 'evidence']);
const CODES = new Set([
  'hosted_environment_invalid', 'hosted_fixture_failed', 'hosted_fixture_cleanup_failed',
  'hosted_inspection_failed', 'hosted_cleanup_failed', 'hosted_checks_failed',
  'hosted_gate_failed_at_create', 'hosted_gate_failed_at_checks',
  'hosted_gate_failed_at_cleanup', 'hosted_gate_failed_at_evidence',
]);

export function sanitizeHostedDiagnostic(value: unknown, _secrets: readonly string[]): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify({ stage: 'unknown', code: 'hosted_gate_failed' });
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.stage !== 'string' || !STAGES.has(candidate.stage) ||
      typeof candidate.code !== 'string' || !CODES.has(candidate.code)) {
    return JSON.stringify({ stage: 'unknown', code: 'hosted_gate_failed' });
  }
  const safe: { stage: string; code: string; statusClass?: string; count?: number } = {
    stage: candidate.stage,
    code: candidate.code,
  };
  if (typeof candidate.status === 'number' && Number.isInteger(candidate.status) &&
      candidate.status >= 100 && candidate.status <= 599) {
    safe.statusClass = `${Math.floor(candidate.status / 100)}xx`;
  }
  if (typeof candidate.count === 'number' && Number.isInteger(candidate.count) &&
      candidate.count >= 0 && candidate.count <= 100) {
    safe.count = candidate.count;
  }
  return JSON.stringify(safe);
}
