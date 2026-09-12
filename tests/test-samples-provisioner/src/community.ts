type Row = Readonly<Record<string, unknown>>;
export async function ensureCommunitySample(adapter: {read:()=>Promise<Row|null>;insert:()=>Promise<unknown>}, expected: Row): Promise<boolean> {
  const existing = await adapter.read();
  if (existing) {
    if (Object.entries(expected).some(([key,value]) => existing[key] !== value)) throw new Error('test_sample_community_collision');
    // Never resurrect a removed fixture or reset real replies/reactions.
    return !existing.deleted_at && !existing.moderation_hidden_at;
  }
  await adapter.insert();
  return true;
}

/** Match the public extras RPC cap without weakening verification of later batches. */
export async function readSampleExtras(ids:readonly string[],read:(ids:readonly string[])=>Promise<{data:unknown;error:unknown}>):Promise<Row[]>{
 const rows:Row[]=[];
 for(let offset=0;offset<ids.length;offset+=50){
  const result=await read(ids.slice(offset,offset+50));
  if(result.error||!Array.isArray(result.data)||result.data.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('test_sample_community_media_public_read_failed');
  rows.push(...result.data as Row[]);
 }
 return rows;
}
