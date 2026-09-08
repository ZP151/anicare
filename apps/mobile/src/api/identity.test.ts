import { submitIdentityProposal } from './identity';

const sightingId = '12345678-1234-1234-1234-123456789abc';
const animalId = '87654321-1234-1234-1234-123456789abc';
const requestId = 'abcdef12-1234-1234-1234-123456789abc';

describe('identity proposal API', () => {
  it('submits only the persisted existing-cat intent with its stable request ID', async () => {
    const rpc = jest.fn(async () => ({ data: [{ proposalId: requestId, source: 'manual_search', status: 'tentative' }], error: null }));

    await expect(submitIdentityProposal({ sightingId, intent: { kind: 'existing', animalId }, requestId }, { rpc }))
      .resolves.toEqual({ proposalId: requestId, source: 'manual_search', status: 'tentative' });

    expect(rpc).toHaveBeenCalledWith('submit_identity_proposal', {
      p_sighting_id: sightingId,
      p_proposed_animal_id: animalId,
      p_source: 'manual_search',
      p_request_id: requestId,
    });
  });

  it('uses the new-animal source without fabricating an animal ID', async () => {
    const rpc = jest.fn(async () => ({ data: [{ proposalId: requestId, source: 'new_animal', status: 'tentative' }], error: null }));

    await submitIdentityProposal({ sightingId, intent: { kind: 'new' }, requestId }, { rpc });

    expect(rpc).toHaveBeenCalledWith('submit_identity_proposal', {
      p_sighting_id: sightingId,
      p_proposed_animal_id: null,
      p_source: 'new_animal',
      p_request_id: requestId,
    });
  });

  it('fails closed on malformed service responses', async () => {
    await expect(submitIdentityProposal({ sightingId, intent: { kind: 'new' }, requestId }, {
      rpc: async () => ({ data: [{ proposalId: 'not-an-id', source: 'new_animal', status: 'tentative' }], error: null }),
    })).rejects.toThrow('identity_proposal_unavailable');
  });

  it('accepts a stable retry after review without calling it pending again', async () => {
    await expect(submitIdentityProposal({ sightingId, intent: { kind: 'new' }, requestId }, {
      rpc: async () => ({ data: [{ proposalId: requestId, source: 'new_animal', status: 'confirmed' }], error: null }),
    })).resolves.toMatchObject({ status: 'confirmed' });
  });
});
