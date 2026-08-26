import { describe, expect, it } from 'vitest';

import { buildReviewQueue, getModerationDueAt } from './queue-policy.js';

describe('moderation SLA', () => {
  it('sets critical reviews to 24 hours and ordinary reviews to 72 hours', () => {
    const createdAt = '2026-08-26T08:00:00.000Z';
    expect(getModerationDueAt('critical', createdAt)).toBe('2026-08-27T08:00:00.000Z');
    expect(getModerationDueAt('normal', createdAt)).toBe('2026-08-29T08:00:00.000Z');
  });
});

describe('buildReviewQueue', () => {
  it('places auto-hidden critical reports before ordinary items and marks overdue work', () => {
    const queue = buildReviewQueue(
      [
        { id: 'normal-1', risk: 'normal', status: 'open', dueAt: '2026-08-29T08:00:00.000Z' },
        { id: 'critical-1', risk: 'critical', status: 'auto_hidden', dueAt: '2026-08-27T08:00:00.000Z' },
      ],
      new Date('2026-08-28T08:00:00.000Z'),
    );

    expect(queue).toEqual([
      { id: 'critical-1', risk: 'critical', status: 'auto_hidden', dueAt: '2026-08-27T08:00:00.000Z', overdue: true },
      { id: 'normal-1', risk: 'normal', status: 'open', dueAt: '2026-08-29T08:00:00.000Z', overdue: false },
    ]);
  });
});

