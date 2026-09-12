/** Retry read transport/RPC failures only. Payload validation stays with the
 * caller, and mutations never pass through this helper. */
export async function retrySampleRead<T extends {error:unknown}>(read:()=>PromiseLike<T>,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  try{const result=await read();if(!result.error||attempt===2)return result;}
  catch(error){if(attempt===2)throw error;}
  await pause(750*(attempt+1));
 }
 throw new Error('test_sample_public_read_failed');
}
