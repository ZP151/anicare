export type MediaBoundaryFailureExpectation = Readonly<{
  stage: 'reserve' | 'finalize' | 'delete';
  status: 403 | 409;
  code: 'media_not_found_or_forbidden' | 'media_reservation_conflict';
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
