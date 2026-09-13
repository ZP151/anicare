import {createBoundedFetch} from './bounded-fetch';

it('aborts a stalled auth request and releases the caller even if fetch ignores abort',async()=>{
 jest.useFakeTimers();
 try {
  let signal:AbortSignal|undefined;
  const fetcher=jest.fn((_input:unknown,init?:RequestInit)=>{signal=init?.signal??undefined;return new Promise<Response>(()=>{});});
  const request=createBoundedFetch(fetcher as typeof fetch)('https://example.test/auth/v1/token',{method:'POST'});
  const result=expect(request).rejects.toMatchObject({name:'AbortError'});
  await jest.advanceTimersByTimeAsync(15000);await result;
  expect(signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
 }finally{jest.useRealTimers();}
});
it('includes the auth response body in the deadline',async()=>{
 jest.useFakeTimers();
 try {
  const request=createBoundedFetch(jest.fn(async()=>({text:()=>new Promise(()=>{})})) as unknown as typeof fetch)('https://example.test/auth/v1/token');
  const result=expect(request).rejects.toMatchObject({name:'AbortError'});
  await jest.advanceTimersByTimeAsync(15000);await result;
 }finally{jest.useRealTimers();}
});
it('preserves response and caller cancellation for ordinary data requests',async()=>{
 const response={status:200} as Response,controller=new AbortController();let signal:AbortSignal|undefined;
 const wrapped=createBoundedFetch(jest.fn(async(_input,init)=>{signal=init?.signal??undefined;return response;}));
 expect(await wrapped('https://example.test/rest/v1/posts',{signal:controller.signal})).toBe(response);
 expect(signal?.aborted).toBe(false);
 const pending=createBoundedFetch(jest.fn(()=>new Promise(()=>{})) as typeof fetch)('https://example.test/rest/v1/posts',{signal:controller.signal});
 const result=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await result;
});

it('releases the actual Supabase auth lock after a stalled PKCE exchange, allowing an RPC to run',async()=>{
 const {createClient}=require('@supabase/supabase-js');
 jest.useFakeTimers();
 const errorLog=jest.spyOn(console,'error').mockImplementation(()=>{});
 try{
  const store=new Map<string,string>();
  let authSignal:AbortSignal|undefined;
  const transport=jest.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(String(input).includes('/auth/v1/token')){authSignal=init?.signal??undefined;return await new Promise<Response>(()=>{});}
   return new Response(JSON.stringify([{animalId:'cat'}]),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const client=createClient('https://lock-test.supabase.co','public-test-key',{
   global:{fetch:createBoundedFetch(transport)},
   auth:{autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce',storageKey:'lock-test',storage:{
    getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)
   }}
  });
  await client.auth.getSession();
  store.set('lock-test-code-verifier',JSON.stringify('test-verifier'));
  const exchange=client.auth.exchangeCodeForSession('test-code');
  await jest.advanceTimersByTimeAsync(0);
  expect(authSignal).toBeDefined();
  let completed=false;
  const rpc=Promise.resolve(client.rpc('get_public_cat_summary',{p_animal_id:'cat'})).then(result=>{completed=true;return result;});
  await jest.advanceTimersByTimeAsync(14999);expect(completed).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect((await exchange).error).toBeTruthy();
  expect(authSignal?.aborted).toBe(true);
  expect((await rpc).data).toEqual([{animalId:'cat'}]);
  expect(completed).toBe(true);
 }finally{errorLog.mockRestore();jest.useRealTimers();}
});
