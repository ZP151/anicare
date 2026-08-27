import { describe, expect, it } from 'vitest';

import {
  ownedStoredSightingSubmission,
  parseSightingSubmission,
  parseStoredSightingSubmission,
  toSightingSubmissionResponse,
} from './sighting-submission.js';

const createSubmission = {
  latitude: 1.3521,
  longitude: 103.8198,
  occurredAt: '2026-08-27T00:00:00.000Z',
  risk: 'normal',
  traits: { coat: 'tortoiseshell' },
  notes: null,
  clientDedupeKey: 'draft-12345678',
} as const;

describe('sighting submission contract', () => {
  it('accepts the exact coordinate-free recovery shape', () => {
    expect(parseSightingSubmission({
      clientDedupeKey: 'draft-12345678',
      recoverExisting: true,
    })).toEqual({
      clientDedupeKey: 'draft-12345678',
      recoverExisting: true,
    });
  });

  it('rejects a recovery request mixed with create-only fields', () => {
    expect(() => parseSightingSubmission({
      ...createSubmission,
      recoverExisting: true,
    })).toThrow();
  });

  it('does not turn a different actor\'s stored sighting into a recovery response', () => {
    const stored = parseStoredSightingSubmission({
      id: '00000000-0000-4000-8000-000000000911',
      reporter_id: '00000000-0000-4000-8000-000000000912',
      visibility: 'public',
      visible_at: '2026-08-27T10:00:00.000Z',
    });

    expect(ownedStoredSightingSubmission(stored, '00000000-0000-4000-8000-000000000913')).toBeNull();
  });

  it('maps retry visibility from the stored sighting instead of caller-controlled fields', () => {
    const stored = parseStoredSightingSubmission({
      id: '00000000-0000-4000-8000-000000000911',
      reporter_id: '00000000-0000-4000-8000-000000000912',
      visibility: 'hidden',
      visible_at: null,
    });

    expect(toSightingSubmissionResponse(stored, '00000000-0000-4000-8000-000000000913')).toEqual({
      sightingId: '00000000-0000-4000-8000-000000000911',
      visibility: 'hidden',
      visibleAt: null,
      requestId: '00000000-0000-4000-8000-000000000913',
    });
  });
});
