import { describe, expect, it, vi } from 'vitest';

import {
  executeSightingSubmission,
  ownedStoredSightingSubmission,
  parseSightingSubmission,
  parseStoredSightingSubmission,
  strictBearerToken,
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

  it('accepts an exact manual coarse-area creation shape', () => {
    expect(parseSightingSubmission({
      manualPublicCellId: '89652636d87ffff',
      occurredAt: '2026-08-31T08:00:00.000Z',
      risk: 'normal',
      traits: {},
      notes: null,
      clientDedupeKey: 'draft-12345678',
    })).toEqual({
      manualPublicCellId: '89652636d87ffff',
      occurredAt: '2026-08-31T08:00:00.000Z',
      risk: 'normal',
      traits: {},
      notes: null,
      clientDedupeKey: 'draft-12345678',
    });
  });

  it.each([
    ['mixed precise and manual modes', { ...createSubmission, manualPublicCellId: '89652636d87ffff' }],
    ['a partial precise mode', { ...createSubmission, longitude: undefined }],
    ['a manual mode with a caller-controlled visibility', {
      manualPublicCellId: '89652636d87ffff', occurredAt: '2026-08-31T08:00:00.000Z',
      risk: 'normal', traits: {}, notes: null, clientDedupeKey: 'draft-12345678', visibility: 'public',
    }],
    ['a manual mode with an unknown key', {
      manualPublicCellId: '89652636d87ffff', occurredAt: '2026-08-31T08:00:00.000Z',
      risk: 'normal', traits: {}, notes: null, clientDedupeKey: 'draft-12345678', latitude: 1.3521,
    }],
  ])('rejects %s', (_reason, payload) => {
    expect(() => parseSightingSubmission(payload)).toThrow();
  });

  it('accepts only ASCII spaces between the bearer scheme and token', () => {
    expect(strictBearerToken(new Request('https://example.invalid', {
      headers: { authorization: 'Bearer access-token' },
    }))).toBe('access-token');
    expect(strictBearerToken(new Request('https://example.invalid', {
      headers: { authorization: 'Bearer\taccess-token' },
    }))).toBeNull();
  });

  it('returns a recovery miss without invoking the creation dependency', async () => {
    const recover = vi.fn(async () => ({ kind: 'not_found' }));
    const create = vi.fn(async () => ({ kind: 'created' }));

    await expect(executeSightingSubmission({
      clientDedupeKey: 'draft-12345678',
      recoverExisting: true,
    }, { recover, create })).resolves.toEqual({ kind: 'not_found' });

    expect(recover).toHaveBeenCalledWith({ clientDedupeKey: 'draft-12345678', recoverExisting: true });
    expect(create).not.toHaveBeenCalled();
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
