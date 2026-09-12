import {readProviderSettings,exchangeAuthCodeOnce} from './provider-settings';
it('uses server availability and does not treat missing flags as enabled',async()=>{
 const request=jest.fn().mockResolvedValue({ok:true,json:async()=>({external:{email:true,google:false,apple:false}})});
 expect(await readProviderSettings('https://example.supabase.co','public-key',request)).toEqual({apple:false,google:false});
 expect(request.mock.calls[0][0]).toBe('https://example.supabase.co/auth/v1/settings');
 request.mockResolvedValue({ok:false});
 await expect(readProviderSettings('https://example.supabase.co','public-key',request)).rejects.toThrow('provider_settings_unavailable');
});
it('exchanges a callback once when the system URL handler and browser finish together',async()=>{
 const exchange=jest.fn().mockResolvedValue({error:null});const client={auth:{exchangeCodeForSession:exchange}};
 await Promise.all([exchangeAuthCodeOnce(client,'one-code'),exchangeAuthCodeOnce(client,'one-code')]);
 expect(exchange).toHaveBeenCalledTimes(1);
 await exchangeAuthCodeOnce(client,'another-code');expect(exchange).toHaveBeenCalledTimes(2);
});
it('allows a failed code exchange to be retried',async()=>{
 const exchange=jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({error:null});
 const client={auth:{exchangeCodeForSession:exchange}};
 await expect(exchangeAuthCodeOnce(client,'retry-code')).rejects.toThrow('network');
 await exchangeAuthCodeOnce(client,'retry-code');expect(exchange).toHaveBeenCalledTimes(2);
});
