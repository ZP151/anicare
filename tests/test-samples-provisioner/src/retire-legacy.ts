import type postgres from 'postgres';
import type { COMMUNITY_TEST_POSTS } from '../../../apps/mobile/src/community/test-samples.js';
import type { samples } from './fixtures.js';

/** Exact fixture allowlist only. Soft retirement preserves foreign keys and audit history. */
export async function retireLegacySamples(db:ReturnType<typeof postgres>,posts:typeof COMMUNITY_TEST_POSTS,cats:typeof samples){
 return db.begin(async sql=>{
  await sql`select pg_advisory_xact_lock(hashtext('c1-samples-v2-retirement'))`;
  const retiredPosts:string[]=[],preservedPosts:string[]=[],archivedCats:string[]=[],preservedCats:string[]=[],retiredSightings:string[]=[],retiredCare:string[]=[];
  const postRefs=await sql`select n.nspname as schema,t.relname as table,a.attname as column
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.community_posts'::regclass`;
  const contentRefs=await sql`select table_schema as schema,table_name as table from information_schema.columns where column_name='content_id' and table_schema in ('public','private')`;
  const postChecked=new Set(['public.community_replies','private.community_post_media','private.test_sample_community_media']);
  for(const post of posts){
   const rows=await sql`select * from public.community_posts where id=${post.id}::uuid for update`;
   if(!rows.length)continue;
   const row=rows[0]!;
   if(row.author_id!==null || row.body!==post.body.en || row.cat_id!==post.catId || row.community_slug!==post.communitySlug){preservedPosts.push(post.id);continue;}
   const references=await sql`select 1 from public.community_replies where post_id=${post.id}::uuid and (author_id is not null or id<>${post.reply.id}::uuid) limit 1`;
   const attachments=await sql`select 1 from private.community_post_media m left join private.test_sample_community_media f on f.media_id=m.media_id and f.post_id=m.post_id where m.post_id=${post.id}::uuid and (f.media_id is null or f.fixture_key<>${'ios26-'+post.code.toLowerCase()}) limit 1`;
   let referenced=references.length>0||attachments.length>0;
   for(const ref of postRefs){if(referenced)break;if(postChecked.has(`${ref.schema}.${ref.table}`))continue;const found=await sql`select 1 from ${sql(`${ref.schema}.${ref.table}`)} where ${sql(ref.column)}=${post.id}::uuid limit 1`;referenced=found.length>0;}
   for(const ref of contentRefs){if(referenced)break;const found=await sql`select 1 from ${sql(`${ref.schema}.${ref.table}`)} where content_id::text=${post.id} limit 1`;referenced=found.length>0;}
   if(referenced){preservedPosts.push(post.id);continue;}
   // Existing deletion triggers enqueue only this post's attached media for cleanup.
   await sql`update public.community_posts set deleted_at=coalesce(deleted_at,now()) where id=${post.id}::uuid`;
   await sql`update public.community_replies set deleted_at=coalesce(deleted_at,now()) where id=${post.reply.id}::uuid and post_id=${post.id}::uuid and author_id is null and body=${post.reply.body.en}`;
   retiredPosts.push(post.id);
  }
  // Any additional foreign-key use conservatively preserves the old cat, including
  // follows, identity work, photos, moderation, and future tables we do not know yet.
  const refs=await sql`select n.nspname as schema,t.relname as table,a.attname as column
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.animals'::regclass`;
  const childRefs=await sql`select n.nspname as schema,t.relname as table,a.attname as column,
    tn.nspname||'.'||target.relname as target
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum=any(c.conkey)
    join pg_class target on target.oid=c.confrelid join pg_namespace tn on tn.oid=target.relnamespace
    where c.contype='f' and c.confrelid in ('public.sightings'::regclass,'public.care_events'::regclass)`;
  const checked=new Set(['public.community_posts','public.sightings','public.care_events','public.animal_aliases','private.cat_presentations','private.test_sample_provisioning']);
  for(const [key,id,alias] of cats){
   const ledger=await sql`select p.fixture_key,a.primary_alias,a.profile_created_by from private.test_sample_provisioning p join public.animals a on a.id=p.animal_id where p.fixture_key=${key} and p.animal_id=${id}::uuid for update of a`;
   if(!ledger.length)continue;
   const label='测试样本 S'+key.slice(-2),name=ledger[0]!.primary_alias as string;
   if(ledger[0]!.profile_created_by!==null || !([alias+' '+label, ...(['Marmalade','Cloud','Tiger','Oreo','Echo','Amber'].map(en=>en+' '+alias+' '+label))].includes(name))){preservedCats.push(id);continue;}
   const use=await sql`select 1 where
    exists(select 1 from public.community_posts where cat_id=${id}::uuid and (author_id is not null or deleted_at is null or not(id=any(${sql.array(retiredPosts)}::uuid[]))))
    or exists(select 1 from public.sightings where animal_id=${id}::uuid and (reporter_id is not null or client_dedupe_key<>${key+'-sighting'} or traits->>'source' is distinct from 'synthetic_test'))
    or exists(select 1 from public.care_events where animal_id=${id}::uuid and (actor_id is not null or client_dedupe_key<>${key+'-care'} or notes is distinct from 'Synthetic reported care test sample.'))
    or exists(select 1 from public.animal_aliases where animal_id=${id}::uuid and created_by is not null)
    or exists(select 1 from private.cat_presentations where animal_id=${id}::uuid and source_metadata->>'fixture_key' is distinct from ${key})`;
   let used=use.length>0;
   for(const ref of refs){
    if(used)break;
    if(checked.has(`${ref.schema}.${ref.table}`))continue;
    const present=await sql`select 1 from ${sql(`${ref.schema}.${ref.table}`)} where ${sql(ref.column)}=${id}::uuid limit 1`;
    used=present.length>0;
   }
   for(const ref of contentRefs){if(used)break;const found=await sql`select 1 from ${sql(`${ref.schema}.${ref.table}`)} where content_id::text in (select id::text from public.sightings where animal_id=${id}::uuid union all select id::text from public.care_events where animal_id=${id}::uuid) limit 1`;used=found.length>0;}
   for(const ref of childRefs){
    if(used)break;
    const found=await sql`select 1 from ${sql(`${ref.schema}.${ref.table}`)} where ${sql(ref.column)} in (select id from ${sql(ref.target)} where animal_id=${id}::uuid) limit 1`;
    used=found.length>0;
   }
   if(used){preservedCats.push(id);continue;}
   await sql`update public.animals set visibility='archived',archived_at=coalesce(archived_at,now()) where id=${id}::uuid`;
   const sightings=await sql`update public.sightings set visibility='archived',visible_at=null where animal_id=${id}::uuid and reporter_id is null and client_dedupe_key=${key+'-sighting'} and traits->>'source'='synthetic_test' returning id`;
   const care=await sql`update public.care_events set visibility='archived',visible_at=null where animal_id=${id}::uuid and actor_id is null and client_dedupe_key=${key+'-care'} and notes='Synthetic reported care test sample.' returning id`;
   retiredSightings.push(...sightings.map(row=>row.id));retiredCare.push(...care.map(row=>row.id));
   archivedCats.push(id);
  }
  return {retiredPosts,preservedPosts,archivedCats,preservedCats,retiredSightings,retiredCare};
 });
}
