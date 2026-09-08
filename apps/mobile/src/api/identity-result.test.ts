import { getMyIdentityResult } from './identity-result';

const sightingId = '12345678-1234-1234-1234-123456789abc';
const proposalId = 'abcdef12-1234-1234-1234-123456789abc';

describe('owner identity result API', () => {
  it('returns only the fixed owner outcome projection', async () => {
    const rpc = jest.fn(async () => ({ data: [{ proposalId, status: 'rejected', decision: 'reject', animalId: null, requestId: sightingId }], error: null }));
    await expect(getMyIdentityResult(sightingId, { rpc })).resolves.toEqual({ proposalId, status: 'rejected', decision: 'reject', animalId: null, requestId: sightingId });
    expect(rpc).toHaveBeenCalledWith('get_my_identity_result', { p_sighting_id: sightingId });
  });

  it('fails closed when the service includes reviewer rationale', async () => {
    await expect(getMyIdentityResult(sightingId, { rpc: async () => ({ data: [{ proposalId, status: 'rejected', decision: 'reject', animalId: null, requestId: sightingId, rationale: 'private' }], error: null }) }))
      .rejects.toThrow('invalid_identity_result');
  });
});
