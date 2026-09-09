const mockBytes = jest.fn();
jest.mock('expo-file-system', () => ({ File: jest.fn(() => ({ bytes: mockBytes })) }));
jest.mock('./supabase', () => ({ getSupabaseClient: () => null }));
import { uploadProfileAvatar } from './profile-avatar-upload';

const jobId = '00000000-0000-4000-8000-000000000001';
const origin = 'https://avatar-test.supabase.co';
const artifact = {uri:'file:///cache/avatar.jpg',sha256:'a'.repeat(64),mimeType:'image/jpeg' as const,width:128,height:128,byteLength:3,recipeVersion:'test',detectorVersions:{}};
const invoke = jest.fn();
const client = {auth:{getSession:async()=>({data:{session:{access_token:'captured-token',user:{id:'owner'}}},error:null})},functions:{invoke}};
let reservation: Record<string,unknown>;
const originalFetch = global.fetch;
const originalOrigin = process.env.EXPO_PUBLIC_SUPABASE_URL;
beforeEach(()=>{
  jest.clearAllMocks(); process.env.EXPO_PUBLIC_SUPABASE_URL = origin;
  reservation = {jobId,reservationExpiresAt:new Date(Date.now()+600000).toISOString(),upload:{signedUrl:`${origin}/storage/v1/object/upload/sign/profile-avatars/avatars/${jobId}.jpg?token=upload-token`,token:'upload-token'}};
  invoke.mockImplementation(async(_name, options)=>({data:options.body.action==='reserve'?reservation:{avatarPath:`avatars/${jobId}.jpg`},error:null}));
  mockBytes.mockResolvedValue(new Uint8Array([1,2,3]));
  global.fetch = jest.fn().mockResolvedValue({ok:true});
});
afterAll(()=>{global.fetch=originalFetch;if(originalOrigin===undefined)delete process.env.EXPO_PUBLIC_SUPABASE_URL;else process.env.EXPO_PUBLIC_SUPABASE_URL=originalOrigin;});
it('uploads only the prepared bytes and pins both requests to the captured account',async()=>{
  await expect(uploadProfileAvatar(artifact,client)).resolves.toBe(`avatars/${jobId}.jpg`);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/profile-avatars/'),expect.objectContaining({body:new Uint8Array([1,2,3]),redirect:'error'}));
  expect(invoke).toHaveBeenCalledTimes(2);
  for(const call of invoke.mock.calls)expect(call[1].headers).toEqual({Authorization:'Bearer captured-token'});
});
it('rejects an upload URL outside the configured project before reading or sending a photo',async()=>{
  reservation.upload={signedUrl:`https://outside.invalid/storage/v1/object/upload/sign/profile-avatars/avatars/${jobId}.jpg?token=upload-token`,token:'upload-token'};
  await expect(uploadProfileAvatar(artifact,client)).rejects.toThrow('avatar_unavailable');
  expect(mockBytes).not.toHaveBeenCalled(); expect(global.fetch).not.toHaveBeenCalled();
});
it('stops after reservation if the account changed',async()=>{
  const current=jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
  await expect(uploadProfileAvatar(artifact,client,current)).rejects.toThrow('stale_account');
  expect(global.fetch).not.toHaveBeenCalled(); expect(invoke).toHaveBeenCalledTimes(1);
});
it.each(['invalid-date',new Date(Date.now()-60000).toISOString(),new Date(Date.now()+3600000).toISOString()])('rejects unusable reservation expiry %s',async expiry=>{
  reservation.reservationExpiresAt=expiry;
  await expect(uploadProfileAvatar(artifact,client)).rejects.toThrow('avatar_unavailable');
  expect(global.fetch).not.toHaveBeenCalled();
});
it('rejects a changed local file before upload',async()=>{
  mockBytes.mockResolvedValue(new Uint8Array([1]));
  await expect(uploadProfileAvatar(artifact,client)).rejects.toThrow('avatar_changed');
  expect(global.fetch).not.toHaveBeenCalled();
});
