export type MediaBoundaryFailureExpectation = Readonly<{
  stage: 'reserve' | 'finalize' | 'delete';
  status: 403 | 409;
  code: 'media_not_found_or_forbidden' | 'media_reservation_conflict';
}>;

export type ActorResultFailureExpectation = Readonly<{
  stage: 'reserve' | 'upload' | 'finalize' | 'delete';
  status: 403 | 409;
  code: 'media_not_found_or_forbidden' | 'media_reservation_conflict' |
    'media_finalization_conflict' | 'storage_upload_failed';
}>;

export function isExactMediaBoundaryFailure(
  value: unknown,
  expected: MediaBoundaryFailureExpectation,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const keys = ['stage', 'kind', 'status', 'code'];
  return Object.keys(actual).length === keys.length && keys.every((key) => Object.hasOwn(actual, key)) &&
    actual.stage === expected.stage && actual.kind === 'http' && actual.status === expected.status &&
    actual.code === expected.code;
}

export function isExactActorResultFailure(
  value: unknown,
  expected: ActorResultFailureExpectation,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const keys = ['ok', 'stage', 'kind', 'status', 'code'];
  return Object.keys(actual).length === keys.length && keys.every((key) => Object.hasOwn(actual, key)) &&
    actual.ok === false && actual.stage === expected.stage && actual.kind === 'http' &&
    actual.status === expected.status && actual.code === expected.code;
}
