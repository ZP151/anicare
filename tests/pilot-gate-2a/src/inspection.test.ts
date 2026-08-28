import { describe, expect, it } from 'vitest';

import {
  isMediaLifecycleTimeControlInput,
  type MediaLifecycleTimeControlInput,
} from './inspection.js';

const JOB_ID = '10000000-0000-4000-8000-000000000001';
const OWNER_ID = '10000000-0000-4000-8000-000000000002';
const MEDIA_ID = '10000000-0000-4000-8000-000000000003';

function candidate(value: unknown): MediaLifecycleTimeControlInput {
  return value as MediaLifecycleTimeControlInput;
}

describe('media lifecycle time control input', () => {
  it('accepts only named timestamp operations bound to three UUIDs', () => {
    const base = { jobId: JOB_ID, ownerId: OWNER_ID, mediaId: MEDIA_ID };
    const tableName = ['private', 'media_upload_jobs'].join('.');
    const arbitraryStatement = ['select', '1'].join(' ');

    expect([
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'schedule_cleanup_now' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: tableName })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: arbitraryStatement })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', table: tableName })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', sql: arbitraryStatement })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', jobId: 'not-a-uuid' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', ownerId: 'not-a-uuid' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', mediaId: 'not-a-uuid' })),
    ]).toEqual([true, true, false, false, false, false, false, false, false]);
  });
});
