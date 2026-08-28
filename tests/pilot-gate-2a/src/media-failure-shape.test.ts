import { describe, expect, it } from 'vitest';

import {
  isExactActorResultFailure,
  isExactMediaBoundaryFailure,
} from './media-failure-shape.js';

describe('isExactMediaBoundaryFailure', () => {
  it('accepts the four-field actor failure and rejects missing or extra fields', () => {
    const expected = {
      stage: 'reserve' as const,
      status: 403 as const,
      code: 'media_not_found_or_forbidden' as const,
    };

    expect([
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'http', status: 403, code: 'media_not_found_or_forbidden' }, expected),
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'http', status: 403 }, expected),
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'http', status: 403, code: 'media_not_found_or_forbidden', detail: 'discarded' }, expected),
      isExactMediaBoundaryFailure({ stage: 'reserve', kind: 'network', status: 403, code: 'media_not_found_or_forbidden' }, expected),
    ]).toEqual([true, false, false, false]);
  });
});

describe('isExactActorResultFailure', () => {
  it('accepts only the exact five-field HTTP failure result', () => {
    const expected = {
      stage: 'upload' as const,
      status: 409 as const,
      code: 'storage_upload_failed' as const,
    };

    expect([
      isExactActorResultFailure({
        ok: false, stage: 'upload', kind: 'http', status: 409, code: 'storage_upload_failed',
      }, expected),
      isExactActorResultFailure({
        stage: 'upload', kind: 'http', status: 409, code: 'storage_upload_failed',
      }, expected),
      isExactActorResultFailure({
        ok: false, stage: 'upload', kind: 'http', status: 409, code: 'storage_upload_failed', detail: 'discarded',
      }, expected),
      isExactActorResultFailure({
        ok: true, stage: 'upload', kind: 'http', status: 409, code: 'storage_upload_failed',
      }, expected),
      isExactActorResultFailure({
        ok: false, stage: 'upload', kind: 'network', status: 409, code: 'storage_upload_failed',
      }, expected),
    ]).toEqual([true, false, false, false, false]);
  });
});
