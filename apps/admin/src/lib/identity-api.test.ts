import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getIdentityReviewerSession } from './identity-session.js';
import {
  getIdentityReviewDetail,
  listIdentityReviewQueue,
  resolveIdentityReview,
  type NarrowIdentityRpcClient,
} from './identity-api.js';

const reviewerId = '00000000-0000-4000-8000-000000003001';
const proposalId = '00000000-0000-4000-8000-000000003002';
const requestId = '00000000-0000-4000-8000-000000003003';

function client(data: unknown, error: unknown = null): NarrowIdentityRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe('identity reviewer session gate', () => {
  it('accepts an active trusted reviewer without widening the platform-admin session', async () => {
    const sessionClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: reviewerId } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    await expect(getIdentityReviewerSession(async () => sessionClient)).resolves.toMatchObject({ state: 'authorised', userId: reviewerId });
    expect(sessionClient.rpc).toHaveBeenCalledWith('identity_has_active_reviewer');
  });

  it('fails closed when the reviewer capability response is malformed', async () => {
    const sessionClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: reviewerId } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: { allowed: true }, error: null }),
    };

    await expect(getIdentityReviewerSession(async () => sessionClient)).resolves.toEqual({ state: 'unavailable' });
  });
});

describe('identity workbench RPC adapters', () => {
  it('accepts only the bounded queue projection and request cursor', async () => {
    const rpc = client([{ proposalId, source: 'manual_search', status: 'tentative', createdAt: '2026-09-08T10:00:00.000Z' }]);

    await expect(listIdentityReviewQueue(rpc, { limit: 20, before: null, requestId })).resolves.toEqual([{
      proposalId, source: 'manual_search', status: 'tentative', createdAt: '2026-09-08T10:00:00.000Z',
    }]);
    expect(rpc.rpc).toHaveBeenCalledWith('list_identity_review_queue', {
      p_limit: 20, p_before_created_at: null, p_before_proposal_id: null, p_request_id: requestId,
    });
  });

  it('rejects a queue row that leaks a storage reference', async () => {
    await expect(listIdentityReviewQueue(client([{
      proposalId, source: 'manual_search', status: 'tentative', createdAt: '2026-09-08T10:00:00.000Z', storagePath: 'jobs/secret.jpg',
    }]), { limit: 20, before: null, requestId })).rejects.toThrow('invalid_identity_review_queue');
  });

  it('maps a safe detail without account, location, or private text fields', async () => {
    const rpc = client([{
      proposalId, source: 'new_animal', status: 'tentative', createdAt: '2026-09-08T10:00:00.000Z',
      proposedAlias: null, timeBucket: 'morning', evidenceState: 'unavailable',
    }]);

    await expect(getIdentityReviewDetail(rpc, proposalId, requestId)).resolves.toEqual({
      proposalId, source: 'new_animal', status: 'tentative', createdAt: '2026-09-08T10:00:00.000Z',
      proposedAlias: null, timeBucket: 'morning', evidenceState: 'unavailable',
    });
  });

  it('uses the locked workbench RPC for an existing-cat decision', async () => {
    const rpc = client([{ proposalId, decision: 'confirm', status: 'confirmed', animalId: reviewerId }]);

    await expect(resolveIdentityReview(rpc, {
      proposalId, source: 'manual_search', decision: 'confirm', rationale: 'Independent evidence supports this existing cat.', requestId,
    })).resolves.toMatchObject({ status: 'confirmed' });
    expect(rpc.rpc).toHaveBeenCalledWith('decide_identity_review_workbench', {
      p_proposal_id: proposalId, p_decision: 'confirm', p_rationale: 'Independent evidence supports this existing cat.', p_primary_alias: null, p_request_id: requestId,
    });
  });

  it('requires an alias and uses the locked workbench RPC for a new cat confirmation', async () => {
    const rpc = client([{ proposalId, decision: 'confirm', status: 'confirmed', animalId: reviewerId }]);

    await expect(resolveIdentityReview(rpc, {
      proposalId, source: 'new_animal', decision: 'confirm', rationale: 'Independent evidence supports a distinct new cat.', alias: 'New Cat', requestId,
    })).resolves.toMatchObject({ status: 'confirmed' });
    expect(rpc.rpc).toHaveBeenCalledWith('decide_identity_review_workbench', {
      p_proposal_id: proposalId, p_decision: 'confirm', p_primary_alias: 'New Cat', p_rationale: 'Independent evidence supports a distinct new cat.', p_request_id: requestId,
    });
  });

  it('uses the locked workbench RPC for a new-cat rejection without an alias', async () => {
    const rpc = client([{ proposalId, decision: 'reject', status: 'rejected', animalId: null }]);

    await expect(resolveIdentityReview(rpc, {
      proposalId, source: 'new_animal', decision: 'reject', rationale: 'Independent evidence does not support a separate profile.', requestId,
    })).resolves.toMatchObject({ status: 'rejected' });
    expect(rpc.rpc).toHaveBeenCalledWith('decide_identity_review_workbench', {
      p_proposal_id: proposalId, p_decision: 'reject', p_rationale: 'Independent evidence does not support a separate profile.', p_primary_alias: null, p_request_id: requestId,
    });
  });
});
