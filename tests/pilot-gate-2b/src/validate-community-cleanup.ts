import {createHash} from 'node:crypto';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {communityCleanupFixture} from './community-cleanup-fixture.js';
import {readHostedGateEnvironment} from './environment.js';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const demand = (value: unknown) => {if (!value) throw new Error('community_cleanup_validation_failed');};

async function main() {
  const env=readHostedGateEnvironment(process.env);
  const ids=communityCleanupFixture(env.workflowRunId,env.workflowRunAttempt);
  const sql=postgres(env.databaseUrl,{ssl:'require',max:1,connect_timeout:15,idle_timeout:5,onnotice:()=>{},connection:{statement_timeout:30000}});
  const client=createClient(env.apiUrl,env.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
  const bucket=client.storage.from('community-media');
  const mediaIds=[ids.expired,ids.live];
  const paths=mediaIds.flatMap(id=>[`media/${id}/thumb.jpg`,`media/${id}/display.jpg`]);
  const bytes=Uint8Array.from([255,216,255,224,0,4,87,67,255,217]);
  const cleanup=async()=>{
    const rows=await sql`select id,payload_hash from private.community_media_jobs where id in ${sql(mediaIds)}`;
    demand(rows.every(row=>row.payload_hash===ids.payloadHash));
    const removed=await bucket.remove(paths);demand(!removed.error);
    await sql`delete from private.community_media_cleanup_jobs where media_id in ${sql(mediaIds)}`;
    await sql`delete from private.community_media_jobs where id in ${sql(mediaIds)} and payload_hash=${ids.payloadHash}`;
    demand((await sql`select 1 from storage.objects where bucket_id='community-media' and name in ${sql(paths)}`).length===0);
    demand((await sql`select 1 from private.community_media_jobs where id in ${sql(mediaIds)}`).length===0);
  };
  try {
    if(process.argv.includes('--cleanup')) {await cleanup();process.stdout.write('community_media_cleanup_fixture_absent\n');return;}
    demand((await sql`select 1 from private.community_media_jobs where id in ${sql(mediaIds)}`).length===0);
    try {
      for(const [index,id] of mediaIds.entries()) {
        const age=index===0?'3 hours':'0 seconds';
        await sql`insert into private.community_media_jobs(id,owner_id,request_id,payload_hash,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,display_sha256,display_byte_length,display_width,display_height,created_at,reservation_expires_at,upload_token_expires_at)
          values(${id},null,${index===0?ids.requestExpired:ids.requestLive},${ids.payloadHash},${hash(bytes)},${bytes.length},1,1,${hash(bytes)},${bytes.length},1,1,now()-${age}::interval,now()-${age}::interval+interval '10 minutes',now()-${age}::interval+interval '2 hours 10 minutes')`;
        await sql`insert into private.community_media_cleanup_jobs(media_id,owner_id,not_before,created_at) values(${id},null,now()-${age}::interval+interval '2 hours 15 minutes',now()-interval '100 years')`;
        for(const variant of ['thumb','display']) demand(!(await bucket.upload(`media/${id}/${variant}.jpg`,bytes,{contentType:'image/jpeg',upsert:false})).error);
      }
      const snapshot=async()=>JSON.stringify(await sql`select to_jsonb(m) media,to_jsonb(c) cleanup from private.community_media_jobs m join private.community_media_cleanup_jobs c on c.media_id=m.id where m.id=${ids.live}`);
      const download=async(path:string)=>{const r=await bucket.download(path);demand(!r.error&&r.data);return hash(new Uint8Array(await r.data!.arrayBuffer()));};
      const before=await snapshot();const liveHashes=await Promise.all(paths.slice(2).map(download));
      demand((await sql`select 1 from private.community_media_cleanup_jobs where media_id in ${sql(mediaIds)} and id=media_id`).length===0);
      const [queued]=await sql`select private.invoke_community_media_cleanup() request_id`;demand(queued?.request_id);
      let success=false;
      for(let attempt=0;attempt<40;attempt++) {
        const [response]=await sql`select status_code,timed_out,content from net._http_response where id=${queued!.request_id}`;
        if(response){demand(response.status_code===200&&!response.timed_out);const result=JSON.parse(response.content);demand(Number.isInteger(result.claimed)&&result.claimed>=1&&result.claimed<=25&&Number.isInteger(result.completed)&&result.completed>=1&&result.completed<=result.claimed);success=true;break;}
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      demand(success);
      demand((await sql`select 1 from private.community_media_jobs m join private.community_media_cleanup_jobs c on c.media_id=m.id where m.id=${ids.expired} and m.status='completed' and c.status='completed'`).length===1);
      for(const path of paths.slice(0,2)){const r=await bucket.download(path);demand(r.error&&!r.data);}
      demand((await sql`select 1 from storage.objects where bucket_id='community-media' and name in ${sql(paths.slice(0,2))}`).length===0);
      demand(before===await snapshot());demand(JSON.stringify(liveHashes)===JSON.stringify(await Promise.all(paths.slice(2).map(download))));
    } finally {await cleanup();}
    process.stdout.write('community_media_cleanup_physical_validation_passed\n');
  } finally {await sql.end({timeout:5});}
}
main().catch(()=>{process.stderr.write('community_media_cleanup_validation_failed\n');process.exitCode=1;});
