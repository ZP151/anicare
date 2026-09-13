/** Prove fixture visibility using the supported global discovery projection.
 * Geographic activity is verified separately against each exact public cell. */
export async function verifyDiscoverableSamples(expected:readonly string[],read:(cursor:string|null)=>PromiseLike<{error:unknown;data:unknown}>):Promise<void>{
 const remaining=new Set(expected),seen=new Set<string>();let cursor:string|null=null;
 for(let page=0;remaining.size&&page<100;page++){
  const result=await read(cursor);
  if(result.error||!Array.isArray(result.data)||!result.data.length)throw new Error('test_sample_discovery_failed');
  for(const row of result.data){
   if(!row||typeof row.animalId!=='string'||typeof row.cursor!=='string'||!row.cursor||seen.has(row.cursor))throw new Error('test_sample_discovery_failed');
   seen.add(row.cursor);remaining.delete(row.animalId);cursor=row.cursor;
  }
 }
 if(remaining.size)throw new Error('test_sample_discovery_failed');
}
