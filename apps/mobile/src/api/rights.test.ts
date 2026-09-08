const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
jest.mock('./supabase', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession, signOut: mockSignOut } }) }));
import { listMyRights } from './rights';

beforeEach(() => { mockSignOut.mockReset().mockResolvedValue({error:null}); mockGetSession.mockReset().mockResolvedValue({data:{session:{access_token:'original-session'}},error:null}); });
it('clears the deleted account session on the exact authentication-required response', async () => {
  const rpc = jest.fn().mockResolvedValue({data:null,error:{code:'42501',message:'authentication_required'}});
  await expect(listMyRights(null,{rpc})).rejects.toThrow('rights_unavailable');
  expect(mockSignOut).toHaveBeenCalledWith({scope:'local'});
});
it('does not sign out a newer account when an older request is rejected', async () => {
  const rpc = jest.fn().mockImplementation(async () => {
    mockGetSession.mockResolvedValue({data:{session:{access_token:'new-session'}},error:null});
    return {data:null,error:{code:'42501',message:'authentication_required'}};
  });
  await expect(listMyRights(null,{rpc})).rejects.toThrow('rights_unavailable');
  expect(mockSignOut).not.toHaveBeenCalled();
});
it('does not sign out for ordinary permission or transport failures', async () => {
  const rpc = jest.fn().mockResolvedValue({data:null,error:{code:'42501',message:'permission_denied'}});
  await expect(listMyRights(null,{rpc})).rejects.toThrow('rights_unavailable');
  expect(mockSignOut).not.toHaveBeenCalled();
});
