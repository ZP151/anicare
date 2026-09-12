/** Retry read transport/RPC failures only. Payload validation stays with the
 * caller, and mutations never pass through this helper. */
export async function retrySampleRead<T extends {error:unknown}>(read:(signal:AbortSignal)=>PromiseLike<T>,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=10_000):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('test_sample_read_timeout'));},timeoutMs);});
  try{const result=await Promise.race([read(controller.signal),deadline]);if(!result.error||attempt===2)return result;}
  catch(error){if(attempt===2)throw error;}
  finally{clearTimeout(timer);}
  await pause(750*(attempt+1));
 }
 throw new Error('test_sample_public_read_failed');
}
