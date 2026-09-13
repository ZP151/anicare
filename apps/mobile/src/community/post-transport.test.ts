const mockRpc = jest.fn();
jest.mock('../api/supabase', () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) }, rpc: (...a: unknown[]) => mockRpc(...a) }) }));
import { createSocialTransport } from './post-transport';
import { SocialTargetUnavailableError } from './post-publisher';
import type { SocialDraft } from './post-draft';
const draft = { body: 'Story', title: '', catId: 'cat', communitySlug: null, images: [], requestId: 'same-key' } as unknown as SocialDraft;
it('preserves only a definite server target rejection as recoverable', async () => {
 mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'community_cat_not_available' } });
 await expect(createSocialTransport('owner', () => true).publish(draft)).rejects.toBeInstanceOf(SocialTargetUnavailableError);
});
it('keeps an ambiguous network failure separate from an explicit target rejection', async () => {
 mockRpc.mockRejectedValue(new Error('network'));
 await expect(createSocialTransport('owner', () => true).publish(draft)).rejects.not.toBeInstanceOf(SocialTargetUnavailableError);
});
it('preserves a deleted existing publication as terminal', async () => {
 mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'community_post_deleted' } });
 await expect(createSocialTransport('owner', () => true).publish(draft)).rejects.toThrow('community_post_deleted');
});
