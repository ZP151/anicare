export type MediaDiagnosticOutcome =
  | 'accepted'
  | `http_${number}`
  | 'network_failure'
  | 'invalid_response'
  | 'unexpected_stage';

function validStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;
}

export function classifyActorResult(value: unknown): MediaDiagnosticOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid_response';
  const actual = value as Record<string, unknown>;

  if (actual.ok === true) return validStatus(actual.status) ? 'accepted' : 'invalid_response';
  if (actual.ok !== false || actual.stage !== 'upload') return 'unexpected_stage';
  if (actual.kind === 'network' && actual.status === null) return 'network_failure';
  if (actual.kind === 'http' && validStatus(actual.status)) return `http_${actual.status}`;
  if (actual.kind === 'invalid_response') return 'invalid_response';
  return 'invalid_response';
}
