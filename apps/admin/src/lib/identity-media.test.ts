import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { serveIdentityReviewMedia } from './identity-media.js';

const proposalId = '00000000-0000-4000-8000-000000003101';
const reviewerId = '00000000-0000-4000-8000-000000003102';

describe('identity media boundary', () => {
  it('does not download private media for an unauthenticated request', async () => {
    let downloads = 0;
    const response = await serveIdentityReviewMedia({ proposalId }, {
      getUser: async () => null,
      getReference: async () => ({ storageBucket: 'media-staging', storagePath: 'jobs/secret.jpg', byteLength: 3 }),
      download: async () => { downloads += 1; return new Blob(['jpg'], { type: 'image/jpeg' }); },
      isStillAuthorised: async () => true,
    });

    expect(response.status).toBe(404);
    expect(downloads).toBe(0);
  });

  it('rechecks reviewer authorization after private storage IO before returning bytes', async () => {
    const response = await serveIdentityReviewMedia({ proposalId }, {
      getUser: async () => reviewerId,
      getReference: async () => ({ storageBucket: 'media-staging', storagePath: 'jobs/secret.jpg', byteLength: 3 }),
      download: async () => new Blob(['jpg'], { type: 'image/jpeg' }),
      isStillAuthorised: async () => false,
    });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('secret');
  });

  it('returns bounded JPEG bytes with private no-store headers', async () => {
    const response = await serveIdentityReviewMedia({ proposalId }, {
      getUser: async () => reviewerId,
      getReference: async () => ({ storageBucket: 'media-staging', storagePath: 'jobs/secret.jpg', byteLength: 3 }),
      download: async () => new Blob(['jpg'], { type: 'image/jpeg' }),
      isStillAuthorised: async () => true,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });
});
