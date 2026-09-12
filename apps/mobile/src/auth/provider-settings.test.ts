import {readProviderSettings,exchangeAuthCodeOnce} from './provider-settings';
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
it('uses server availability and does not treat missing flags as enabled',async()=>{
 const unsupported=jest.spyOn(AbortSignal,'timeout').mockImplementation(()=>{throw new Error('Not available in React Native');});
 const request=jest.fn().mockResolvedValue({ok:true,json:async()=>({external:{email:true,google:false,apple:false}})});
 expect(await readProviderSettings('https://example.supabase.co','public-key',request)).toEqual({apple:false,google:false});
 expect(request.mock.calls[0][0]).toBe('https://example.supabase.co/auth/v1/settings');
 request.mockResolvedValue({ok:false});
 await expect(readProviderSettings('https://example.supabase.co','public-key',request)).rejects.toThrow('provider_settings_unavailable');
 unsupported.mockRestore();
});
it('aborts a stalled provider lookup and clears its timer',async()=>{
 jest.useFakeTimers();
 const request=jest.fn((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
 const result=readProviderSettings('https://example.supabase.co','public-key',request as never);
 const assertion=expect(result).rejects.toThrow('aborted');
 jest.advanceTimersByTime(8000);await assertion;expect(jest.getTimerCount()).toBe(0);
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
