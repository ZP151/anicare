import { describe, expect, it, vi } from 'vitest';

const proposalId = '00000000-0000-4000-8000-000000003201';
const actorId = '00000000-0000-4000-8000-000000003202';
const media = { storageBucket: 'media-staging', storagePath: 'jobs/private.jpg', byteLength: 3 };
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), session: vi.fn(), createService: vi.fn(), createServer: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/identity-session', () => ({ getIdentityReviewerSession: mocks.session }));
vi.mock('../../../../lib/supabase/server', () => ({ createAdminServerClient: mocks.createServer, createAdminServiceClient: mocks.createService }));

import { GET } from './route.js';

describe('identity media route', () => {
  it('does not return bytes when the proposal-specific post-download lookup is revoked', async () => {
    mocks.session.mockResolvedValue({ state: 'authorised', userId: actorId, client: {} });
    mocks.rpc.mockResolvedValueOnce({ data: [media], error: null }).mockResolvedValueOnce({ data: [], error: null });
    mocks.download.mockResolvedValue({ data: new Blob(['jpg'], { type: 'image/jpeg' }), error: null });
    mocks.createService.mockReturnValue({ rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } });
    mocks.createServer.mockResolvedValue({});

    const response = await GET(new Request('https://admin.test/identity/x/media'), { params: Promise.resolve({ proposalId }) });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('jpg');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
