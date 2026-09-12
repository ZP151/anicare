import {describe, expect, it} from 'vitest';
import {authorizeCleanupRequest, validCleanupBody} from './community-cleanup-request.js';

const token = 'a'.repeat(43);
describe('cleanup invocation boundary', () => {
  const now = 1789315200000;
  async function signed(time=String(now/1000)) {
    const nonce='00000000-0000-4000-8000-000000000001';
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`animalhelper-community-media-cleanup-v1\n${time}\n${nonce}\n{}`)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    return new Request('https://example.com',{headers:{'x-cleanup-time':time,'x-cleanup-nonce':nonce,'x-cleanup-signature':signature}});
  }
  it('accepts a short-lived signed capability and the existing admin fallback', async () => {
    expect((await signed()).headers.get('x-cleanup-signature')).toBe('d8fb5a174d4d9f79a4e1c091faa1612fff6653fa0936181b45bc13b4bb81e92f');
    expect(await authorizeCleanupRequest(await signed(), 'service', token,now)).toBe(true);
    expect(await authorizeCleanupRequest(new Request('https://example.com', {headers:{authorization:'Bearer service'}}), 'service', undefined,now)).toBe(true);
  });
  it.each([-301,31])('rejects stale or future signatures %s', async seconds => {
    expect(await authorizeCleanupRequest(await signed(String(now/1000+seconds)), 'service', token,now)).toBe(false);
  });
  it('rejects tampering and never accepts the raw capability header',async()=>{
    const request=await signed();request.headers.set('x-cleanup-nonce','00000000-0000-4000-8000-000000000002');
    expect(await authorizeCleanupRequest(request,'service',token,now)).toBe(false);
    expect(await authorizeCleanupRequest(new Request('https://example.com',{headers:{'x-community-media-cleanup-token':token}}),'service',token,now)).toBe(false);
    expect(await authorizeCleanupRequest(await signed(),'service','invalid',now)).toBe(false);
  });
  it('accepts empty manual requests and the exact pg_net JSON envelope', async () => {
    expect(await validCleanupBody(new Request('https://example.com',{method:'POST'}))).toBe(true);
    expect(await validCleanupBody(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))).toBe(true);
  });
  it.each(['{"paths":[]}', '[]',' {}','{} ', ''])('rejects noncanonical JSON %s', async body => {
    expect(await validCleanupBody(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json'},body}))).toBe(false);
  });
  it('reads streams instead of trusting absent Content-Length', async () => {
    expect(await validCleanupBody(new Request('https://example.com',{method:'POST',body:'x'}))).toBe(false);
  });
});
