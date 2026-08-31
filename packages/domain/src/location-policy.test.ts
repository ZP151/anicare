import { describe, expect, it } from 'vitest';

import {
  canViewPreciseLocation,
  getPublicExposure,
  toPublicLocationCell,
} from './location-policy.js';

describe('public location policy', () => {
  it('publishes only an H3 resolution 9 cell and never echoes coordinates', () => {
    const cell = toPublicLocationCell({ latitude: 1.3521, longitude: 103.8198 });

    expect(cell).toMatchObject({ resolution: 9 });
    expect(cell.cellId).toMatch(/^[0-9a-f]+$/);
    expect(cell).not.toHaveProperty('latitude');
    expect(cell).not.toHaveProperty('longitude');
  });

  it('delays normal and sensitive events while keeping critical events hidden', () => {
    const occurredAt = new Date('2026-08-26T08:00:00.000Z');

    expect(getPublicExposure('normal', occurredAt)).toEqual({
      visible: true,
      visibleAt: '2026-08-26T10:00:00.000Z',
      timeBucket: 'afternoon',
    });
    expect(getPublicExposure('sensitive', occurredAt).visibleAt).toBe(
      '2026-08-27T08:00:00.000Z',
    );
    expect(getPublicExposure('critical', occurredAt)).toEqual({
      visible: false,
      visibleAt: null,
      timeBucket: null,
    });
  });
});

describe('precise location grants', () => {
  it('allows only the assigned user, animal and purpose before expiry', () => {
    const grant = {
      id: 'grant-1',
      userId: 'guardian-1',
      animalId: 'cat-1',
      purpose: 'welfare_check' as const,
      grantedAt: '2026-08-26T08:00:00.000Z',
      expiresAt: '2026-08-27T08:00:00.000Z',
      revokedAt: null,
    };

    expect(
      canViewPreciseLocation(grant, {
        userId: 'guardian-1',
        animalId: 'cat-1',
        purpose: 'welfare_check',
        now: new Date('2026-08-26T12:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      canViewPreciseLocation(grant, {
        userId: 'guardian-1',
        animalId: 'cat-2',
        purpose: 'welfare_check',
        now: new Date('2026-08-26T12:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('denies revoked and expired grants', () => {
    const baseGrant = {
      id: 'grant-1',
      userId: 'guardian-1',
      animalId: 'cat-1',
      purpose: 'welfare_check' as const,
      grantedAt: '2026-08-26T08:00:00.000Z',
      expiresAt: '2026-08-27T08:00:00.000Z',
      revokedAt: null,
    };
    const context = {
      userId: 'guardian-1',
      animalId: 'cat-1',
      purpose: 'welfare_check' as const,
      now: new Date('2026-08-28T08:00:00.000Z'),
    };

    expect(canViewPreciseLocation(baseGrant, context)).toBe(false);
    expect(
      canViewPreciseLocation(
        { ...baseGrant, revokedAt: '2026-08-26T09:00:00.000Z' },
        { ...context, now: new Date('2026-08-26T08:30:00.000Z') },
      ),
    ).toBe(false);
  });
});
