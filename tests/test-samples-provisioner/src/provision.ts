import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { ensurePortrait } from './portrait.js';
import { samples, legacyEnglishNames, samplePlaces } from './fixtures.js';
import { COMMUNITY_TEST_POSTS } from '../../../apps/mobile/src/community/test-samples.js';
import { ensureCommunitySample, readSampleExtras } from './community.js';
import { canUpgradeNoPhotoPortrait } from './fixture-upgrade.js';
import { validateCommunityMediaVariants, type CommunityMediaVariant } from './media.js';
import { retrySampleRead } from './read-retry.js';

const project = 'https://fhugdtpjbgiatqhvjioy.supabase.co';

function required(name: string) { const value = process.env[name]; if (!value) throw new Error('test_sample_environment_invalid'); return value; }
function sha256(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function assetPath(filename: string) { return resolve(import.meta.dirname, '../../../docs/test-samples/ios-v1/assets', filename); }
function thumbAssetPath(filename: string) { return assetPath(filename.replace(/\.jpg$/, '-thumb.jpg')); }
function fixtureMediaId(index: number) { return `00000000-0000-4000-8000-00000000e${String(101 + index).padStart(3, '0')}`; }
function fixtureMediaRequestId(index: number) { return `00000000-0000-4000-8000-00000000f${String(101 + index).padStart(3, '0')}`; }
function mediaPayloadHash(fixtureKey: string, position: number, display: CommunityMediaVariant, thumb: CommunityMediaVariant) {
  return sha256(Buffer.from(JSON.stringify({fixtureKey, position, display: {sha256: display.sha256, byteLength: display.bytes.byteLength, width: display.width, height: display.height}, thumb: {sha256: thumb.sha256, byteLength: thumb.bytes.byteLength, width: thumb.width, height: thumb.height}})));
}
function validDatabaseTarget(value: string) {
  try {
    const parsed = new URL(value);
    const ref = 'fhugdtpjbgiatqhvjioy';
    return ['postgres:', 'postgresql:'].includes(parsed.protocol) && (
      (parsed.hostname === `db.${ref}.supabase.co` && parsed.username === 'postgres') ||
      (parsed.hostname.endsWith('.pooler.supabase.com') && parsed.username === `postgres.${ref}`)
    );
  } catch { return false; }
}
type FixtureMediaBucket = Readonly<{
  list(path: string, options: {search: string; limit: number}): Promise<{data: unknown; error: unknown}>;
  download(path: string): Promise<{data: Blob | null; error: unknown}>;
  upload(path: string, bytes: Uint8Array, options: {contentType: string; upsert: false}): Promise<{error: unknown}>;
}>;
async function ensureCommunityMediaObject(bucket: FixtureMediaBucket, path: string, bytes: Uint8Array, expectedSha: string) {
  const slash = path.lastIndexOf('/'); const directory = path.slice(0, slash); const filename = path.slice(slash + 1);
  const listed = await bucket.list(directory, {search: filename, limit: 100});
  if (listed.error || !Array.isArray(listed.data) || listed.data.some(row => !row || typeof row !== 'object' || typeof (row as {name?: unknown}).name !== 'string')) throw new Error('test_sample_community_media_list_failed');
  if (listed.data.some(row => (row as {name: string}).name === filename)) {
    const downloaded = await bucket.download(path);
    if (downloaded.error || !downloaded.data || sha256(new Uint8Array(await downloaded.data.arrayBuffer())) !== expectedSha) throw new Error('test_sample_community_media_collision');
    return;
  }
  const uploaded = await bucket.upload(path, bytes, {contentType: 'image/jpeg', upsert: false});
  if (uploaded.error) throw new Error('test_sample_community_media_upload_failed');
}
async function main() {
  const url = required('SUPABASE_URL').replace(/\/$/, '');
  if (url !== project || process.env.CONFIRM_IOS26_TEST_SAMPLES !== 'yes') throw new Error('test_sample_target_refused');
  const provenance = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../docs/test-samples/ios-v1/asset-provenance.json'), 'utf8')) as {assets: Array<{file:string;source:string;sha256:string}>};
  const portraitAssetNames = samples.flatMap(sample => sample[3] ? [sample[3]] : []);
  const communityAssetNames = COMMUNITY_TEST_POSTS.flatMap(post => post.media.flatMap(filename => [filename, filename.replace(/\.jpg$/, '-thumb.jpg')]));
  const approvedAssetNames = new Set([...portraitAssetNames, ...communityAssetNames]);
  for (const filename of approvedAssetNames) {
    const approved = provenance.assets.find(asset => asset.file === `assets/${filename}` && asset.source === 'synthetic_test');
    const bytes = await readFile(filename.endsWith('-thumb.jpg') ? thumbAssetPath(filename.replace(/-thumb\.jpg$/, '.jpg')) : assetPath(filename));
    if (!approved || sha256(bytes) !== approved.sha256) throw new Error('test_sample_asset_not_approved');
  }
  if (process.env.IOS26_TEST_SAMPLES_DRY_RUN === 'yes') {
    const manifest = {projectRef: 'fhugdtpjbgiatqhvjioy', dryRun: true, fixtureKeys: samples.map(([key]) => key), portraitCount: samples.filter(sample => sample[3]).length, communityPostIds: COMMUNITY_TEST_POSTS.map(post => post.id), communityReplyIds: COMMUNITY_TEST_POSTS.map(post => post.reply.id), communityMediaPostIds: COMMUNITY_TEST_POSTS.filter(post => post.media.length > 0).map(post => post.id)};
    await writeFile(required('IOS26_TEST_SAMPLES_MANIFEST_PATH'), `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write('ios26_test_samples_dry_run\n');
    return;
  }
  const databaseUrl = required('SUPABASE_DATABASE_URL');
  if (!validDatabaseTarget(databaseUrl)) throw new Error('test_sample_database_refused');
  const db = postgres(databaseUrl, { max: 1, ssl: 'require', prepare: false, debug: false, onnotice: () => undefined });
  const storage = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const publicKey = required('SUPABASE_PUBLIC_KEY');
  const anonymous = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    for (const [index, [key, id, alias, filename, cell]] of samples.entries()) {
      const label = `测试样本 S${String(index + 1).padStart(2, '0')}`;
      const path = filename ? `synthetic-test/${id}/portrait.jpg` : null;
      const bytes = filename ? await readFile(assetPath(filename)) : Buffer.from(`synthetic-test:${key}`);
      const sha = sha256(bytes);
      const english = legacyEnglishNames[index];
      const displayAlias = english ? `${english} ${alias}` : alias;
      const place = samplePlaces[key];
      await db.begin(async sql => {
        await sql`select pg_advisory_xact_lock(hashtext(${key}))`;
        const existing = await sql`select fixture_key,animal_id,source_sha256 from private.test_sample_provisioning where fixture_key=${key}`;
        if (existing.length !== 0) {
          const upgrade = canUpgradeNoPhotoPortrait([key, id, alias, filename, cell], {animalId: existing[0]!.animal_id, sourceSha256: existing[0]!.source_sha256});
          if (existing[0]!.animal_id !== id || (existing[0]!.source_sha256 !== sha && !upgrade)) throw new Error('test_sample_collision');
          if (upgrade && filename && path) {
            const bucket = storage.storage.from('cat-portraits');
            await ensurePortrait({
              list: () => bucket.list(`synthetic-test/${id}`, {search:'portrait.jpg',limit:100}),
              download: () => bucket.download(path),
              upload: () => bucket.upload(path,bytes,{contentType:'image/jpeg',upsert:false}),
            },sha);
            const presentation = await sql`update private.cat_presentations set portrait_path=${path} where animal_id=${id}::uuid and portrait_path is null and sample_label=${label} and source_metadata->>'fixture_key'=${key} returning animal_id`;
            if (presentation.length !== 1) throw new Error('test_sample_collision');
            await sql`update private.test_sample_provisioning set source_sha256=${sha} where fixture_key=${key} and source_sha256=${existing[0]!.source_sha256}`;
          }
          // Only upgrade the original untouched fixture name; never overwrite a later user edit.
          if (english) {
            await sql`insert into public.animal_aliases(animal_id,alias) values(${id}::uuid,${english}) on conflict(animal_id,alias) do nothing`;
            await sql`update public.animals set primary_alias=${displayAlias+' '+label} where id=${id}::uuid and primary_alias=${alias+' '+label}`;
          }
          if(place) await sql`update public.sightings set traits=jsonb_set(traits,'{public_place}',${sql.json(place)}::jsonb) where animal_id=${id}::uuid and client_dedupe_key=${key+'-sighting'} and traits->>'source'='synthetic_test' and (not traits ? 'public_place' or (jsonb_typeof(traits->'public_place')='string' and traits->>'public_place'=${JSON.stringify(place)}))`;
          return;
        }
        if (filename && path) {
          const bucket = storage.storage.from('cat-portraits');
          await ensurePortrait({
            list: () => bucket.list(`synthetic-test/${id}`, {search:'portrait.jpg',limit:100}),
            download: () => bucket.download(path),
            upload: () => bucket.upload(path,bytes,{contentType:'image/jpeg',upsert:false}),
          },sha);
        }
        await sql`insert into public.animals(id,primary_alias,verification,lifecycle,visibility,identity_origin_required,confirmed_photo_count) values(${id}::uuid,${displayAlias + ' ' + label},'reported','active','public',false,0)`;
        await sql`insert into public.animal_aliases(animal_id,alias) values(${id}::uuid,${label})`;
        await sql`insert into public.sightings(animal_id,occurred_at,recorded_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,notes,client_dedupe_key) values(${id}::uuid,now()-case when ${index} not in (4,5) then interval '8 hours' else interval '8 days' end,now()-case when ${index} not in (4,5) then interval '7 hours' else interval '7 days 23 hours' end,${cell},'morning','normal','public',now()-case when ${index} not in (4,5) then interval '5 hours' else interval '7 days 21 hours' end,'{"source":"synthetic_test","provenance":"reported"}'::jsonb,'Synthetic test sample; not a human confirmation.',${key + '-sighting'})`;
        await sql`insert into public.care_events(animal_id,activity,completed_at,public_cell_id,notes,client_dedupe_key,visibility,visible_at,created_at) values(${id}::uuid,'feed',now()-case when ${index} not in (4,5) then interval '6 hours' else interval '6 days' end,${cell},'Synthetic reported care test sample.',${key + '-care'},'public',now()-case when ${index} not in (4,5) then interval '3 hours' else interval '5 days' end,now()-case when ${index} not in (4,5) then interval '5 hours' else interval '5 days 2 hours' end)`;
        await sql`insert into private.cat_presentations(animal_id,portrait_path,sample_label,source_metadata) values(${id}::uuid,${path},${label},jsonb_build_object('provenance','synthetic_test','training_eligible',false,'fixture_key',${key}::text))`;
        await sql`insert into private.test_sample_provisioning(fixture_key,animal_id,source_sha256) values(${key},${id}::uuid,${sha})`;
        if(place) await sql`update public.sightings set traits=jsonb_set(traits,'{public_place}',${sql.json(place)}::jsonb) where animal_id=${id}::uuid and client_dedupe_key=${key+'-sighting'}`;
      });
    }
    const ids = samples.map(([, id]) => id);
    const presentations = await retrySampleRead(signal=>anonymous.rpc('get_public_cat_presentations', { p_animal_ids: ids }).abortSignal(signal));
    if (presentations.error || !Array.isArray(presentations.data) || presentations.data.length !== samples.length) throw new Error('test_sample_public_read_failed');
    const rows = presentations.data as Array<{ animalId: string; portraitPath: string | null; sampleLabel: string }>;
    if (new Set(rows.map((row) => row.animalId)).size !== samples.length || new Set(rows.map((row) => row.sampleLabel)).size !== samples.length) throw new Error('test_sample_public_projection_invalid');
    const portraitRows = rows.filter(row => row.portraitPath !== null);
    if (portraitRows.length !== samples.filter(sample=>sample[3]).length || ids.some(id => !rows.some(row => row.animalId === id))) throw new Error('test_sample_public_projection_invalid');
    for (const row of portraitRows) {
      const signed = await retrySampleRead(() => anonymous.storage.from('cat-portraits').createSignedUrl(row.portraitPath!, 60));
      const portraitUrl=signed.data?.signedUrl;
      const response = portraitUrl ? await retrySampleRead(async signal=>{
        const received=await fetch(portraitUrl,{signal});
        return {error:!received.ok,contentType:received.headers.get('content-type'),bytes:new Uint8Array(await received.arrayBuffer())};
      }) : null;
      const filename = samples.find(sample => sample[1] === row.animalId)?.[3];
      if (!filename || row.portraitPath !== `synthetic-test/${row.animalId}/portrait.jpg`) throw new Error('test_sample_public_projection_invalid');
      const expected = await readFile(assetPath(filename));
      if (signed.error || !response || response.error || !response.contentType?.startsWith('image/jpeg') || sha256(response.bytes) !== sha256(expected)) throw new Error('test_sample_signed_portrait_failed');
    }
    for (const id of ids) {
      const summary = await retrySampleRead(signal=>anonymous.rpc('get_public_cat_summary', { p_animal_id: id }).abortSignal(signal));
      const care = await retrySampleRead(signal=>anonymous.rpc('list_public_care_history', { p_animal_id: id, p_cursor: null, p_limit: 20 }).abortSignal(signal));
      if (summary.error || !Array.isArray(summary.data) || summary.data.length !== 1 || care.error || !Array.isArray(care.data) || care.data.length < 1) throw new Error('test_sample_public_journey_failed');
      const fixture=samples.find(sample=>sample[1]===id)!;
      const activity=await retrySampleRead(signal=>anonymous.rpc('list_public_cat_community_activity',{p_animal_id:id}).abortSignal(signal));
      if(activity.error || !Array.isArray(activity.data) || !activity.data.some(row=>row.publicCellId===fixture[4])) throw new Error('test_sample_map_activity_failed');
      const expectedPlace=samplePlaces[fixture[0]];
      if(expectedPlace && !activity.data.some(row=>row.residenceName===expectedPlace.name && row.residenceType===expectedPlace.residenceType))throw new Error('test_sample_building_context_failed');
    }
    for (const cell of new Set(samples.map(([, , , , cell]) => cell))) {
      const discovery = await retrySampleRead(signal=>anonymous.rpc('list_public_cat_discovery', { p_public_cell_id: cell, p_verifications: null, p_cursor: null, p_limit: 50 }).abortSignal(signal));
      if (discovery.error || !Array.isArray(discovery.data) || discovery.data.length < 1) throw new Error('test_sample_discovery_failed');
    }
    const mediaFixtures = COMMUNITY_TEST_POSTS.flatMap((post) => post.media.map((sourceFile, position) => ({post, sourceFile, position, fixtureKey: `ios26-${post.code.toLowerCase()}`})));
    const visiblePostIds: string[] = [];
    const visibleReplyIds: string[] = [];
    for (const post of COMMUNITY_TEST_POSTS) {
      process.stdout.write(`test_sample_post_started ${post.code}\n`);
      const visible = await db.begin(async sql => {
        await sql`select pg_advisory_xact_lock(hashtext(${post.id}))`;
        const expected = {id:post.id,author_id:null,body:post.body.en,cat_id:post.catId,community_slug:post.communitySlug};
        const available = await ensureCommunitySample({
          read:async()=> (await sql`select * from public.community_posts where id=${post.id}::uuid`)[0] ?? null,
          insert:()=>sql`insert into public.community_posts(id,author_id,body,cat_id,community_slug,created_at) values(${post.id}::uuid,null,${post.body.en},${post.catId}::uuid,${post.communitySlug},now()-${post.ageHours}*interval '1 hour')`,
        },expected);
        if (!available) return false;
        await ensureCommunitySample({
          read:async()=> (await sql`select * from public.community_replies where id=${post.reply.id}::uuid`)[0] ?? null,
          insert:()=>sql`insert into public.community_replies(id,post_id,author_id,body,created_at) values(${post.reply.id}::uuid,${post.id}::uuid,null,${post.reply.body.en},now()-${post.ageHours-1}*interval '1 hour')`,
        },{id:post.reply.id,post_id:post.id,author_id:null,body:post.reply.body.en});
        return true;
      });
      if (!visible) continue;
      for (const fixture of mediaFixtures.filter(candidate => candidate.post.id === post.id)) {
        const sequence = mediaFixtures.findIndex(candidate => candidate.fixtureKey === fixture.fixtureKey && candidate.position === fixture.position);
        const mediaId = fixtureMediaId(sequence); const requestId = fixtureMediaRequestId(sequence);
        const displayBytes = new Uint8Array(await readFile(assetPath(fixture.sourceFile)));
        const thumbBytes = new Uint8Array(await readFile(thumbAssetPath(fixture.sourceFile)));
        const variants = await validateCommunityMediaVariants(displayBytes, thumbBytes);
        const payloadHash = mediaPayloadHash(fixture.fixtureKey, fixture.position, variants.display, variants.thumb);
        await db.begin(async sql => {
          await sql`select pg_advisory_xact_lock(hashtext(${fixture.fixtureKey+':'+fixture.position}))`;
          const existing = await sql`select media_id,source_file,display_sha256,thumb_sha256 from private.test_sample_community_media where fixture_key=${fixture.fixtureKey} and position=${fixture.position} for update`;
          if (existing.length !== 0) {
            if (existing[0]!.media_id !== mediaId || existing[0]!.source_file !== fixture.sourceFile || existing[0]!.display_sha256 !== variants.display.sha256 || existing[0]!.thumb_sha256 !== variants.thumb.sha256) throw new Error('test_sample_community_media_collision');
            const job = await sql`select status from private.community_media_jobs where id=${mediaId}::uuid`;
            if (job.length !== 1 || !['reserved','finalized','attached'].includes(job[0]!.status)) throw new Error('test_sample_community_media_reprovision_required');
            return;
          }
          await sql`insert into private.community_media_jobs(id,owner_id,request_id,payload_hash,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,display_sha256,display_byte_length,display_width,display_height,reservation_expires_at,upload_token_expires_at,status) values(${mediaId}::uuid,null,${requestId}::uuid,${payloadHash},${variants.thumb.sha256},${variants.thumb.bytes.byteLength},${variants.thumb.width},${variants.thumb.height},${variants.display.sha256},${variants.display.bytes.byteLength},${variants.display.width},${variants.display.height},now()+interval '10 minutes',now()+interval '2 hours 10 minutes','reserved')`;
          await sql`insert into private.community_media_cleanup_jobs(media_id,owner_id,not_before) values(${mediaId}::uuid,null,now()+interval '2 hours 15 minutes')`;
          await sql`insert into private.test_sample_community_media(fixture_key,position,post_id,media_id,source_file,display_sha256,thumb_sha256) values(${fixture.fixtureKey},${fixture.position},${post.id}::uuid,${mediaId}::uuid,${fixture.sourceFile},${variants.display.sha256},${variants.thumb.sha256})`;
        });
        const bucket = storage.storage.from('community-media');
        await ensureCommunityMediaObject(bucket, `media/${mediaId}/display.jpg`, variants.display.bytes, variants.display.sha256);
        await ensureCommunityMediaObject(bucket, `media/${mediaId}/thumb.jpg`, variants.thumb.bytes, variants.thumb.sha256);
        await db.begin(async sql => {
          await sql`select pg_advisory_xact_lock(hashtext(${fixture.fixtureKey+':'+fixture.position}))`;
          const target = await sql`select id from public.community_posts where id=${post.id}::uuid and deleted_at is null and moderation_hidden_at is null for update`;
          if (target.length !== 1) throw new Error('test_sample_community_post_not_available');
          const attached = await sql`select media_id from private.community_post_media where post_id=${post.id}::uuid and position=${fixture.position}`;
          if (attached.length !== 0 && attached[0]!.media_id !== mediaId) throw new Error('test_sample_community_media_collision');
          if (attached.length === 0) await sql`insert into private.community_post_media(post_id,media_id,position) values(${post.id}::uuid,${mediaId}::uuid,${fixture.position})`;
          const updated = await sql`update private.community_media_jobs set status='attached',finalized_at=coalesce(finalized_at,now()),attached_at=coalesce(attached_at,now()) where id=${mediaId}::uuid and status in ('reserved','attached') returning id`;
          if (updated.length !== 1) throw new Error('test_sample_community_media_collision');
          await sql`update private.community_media_cleanup_jobs set status='completed',completed_at=coalesce(completed_at,now()),claimed_at=null,claim_id=null where media_id=${mediaId}::uuid`;
        });
      }
      const [{data:detail,error:detailError},{data:replies,error:replyError},{data:reaction,error:reactionError}] = await Promise.all([
        retrySampleRead(signal=>anonymous.rpc('get_public_community_post',{p_post_id:post.id}).abortSignal(signal)),
        retrySampleRead(signal=>anonymous.rpc('list_public_community_replies',{p_post_id:post.id,p_cursor:null,p_limit:30}).abortSignal(signal)),
        retrySampleRead(signal=>anonymous.rpc('get_community_post_reactions',{p_post_ids:[post.id]}).abortSignal(signal)),
      ]);
      if (detailError || !Array.isArray(detail) || detail.length!==1 || detail[0].body!==post.body.en ||
          replyError || !Array.isArray(replies) || reactionError || !Array.isArray(reaction) || reaction.length!==1) {
        process.stderr.write(JSON.stringify({sample:post.code,detailError:!!detailError,replyError:!!replyError,reactionError:!!reactionError,detailRows:Array.isArray(detail)?detail.length:null,reactionRows:Array.isArray(reaction)?reaction.length:null,bodyMatches:Array.isArray(detail)&&detail[0]?.body===post.body.en})+'\n');
        throw new Error('test_sample_community_journey_failed');
      }
      visiblePostIds.push(post.id);
      if (replies.some(reply=>reply.replyId===post.reply.id && reply.body===post.reply.body.en)) visibleReplyIds.push(post.reply.id);
    }
    const extras = await readSampleExtras(visiblePostIds,ids=>retrySampleRead(signal=>anonymous.rpc('get_public_community_post_extras', {p_post_ids: ids}).abortSignal(signal)));
    for (const fixture of mediaFixtures.filter(candidate => visiblePostIds.includes(candidate.post.id))) {
      const sequence = mediaFixtures.findIndex(candidate => candidate.fixtureKey === fixture.fixtureKey && candidate.position === fixture.position);
      const mediaId = fixtureMediaId(sequence); const extra = extras.find((row: {postId?: unknown}) => row.postId === fixture.post.id) as {media?: Array<{mediaId?: unknown}>} | undefined;
      if (!extra || !Array.isArray(extra.media) || extra.media[fixture.position]?.mediaId !== mediaId) throw new Error('test_sample_community_media_public_read_failed');
      const response = await retrySampleRead(async signal=>{
        const received=await fetch(`${url}/functions/v1/community-media?postId=${fixture.post.id}&mediaId=${mediaId}&variant=display`, {headers: {apikey: publicKey},signal});
        return {error:!received.ok,contentType:received.headers.get('content-type'),bytes:new Uint8Array(await received.arrayBuffer())};
      });
      const expected = await readFile(assetPath(fixture.sourceFile));
      if (response.error || !response.contentType?.startsWith('image/jpeg') || sha256(response.bytes) !== sha256(expected)) throw new Error('test_sample_community_media_public_read_failed');
    }
    const manifest = { projectRef: 'fhugdtpjbgiatqhvjioy', fixtureKeys: samples.map(([key]) => key), portraitCount: portraitRows.length, communityPostIds:visiblePostIds, communityReplyIds:visibleReplyIds, communityMediaPostIds: COMMUNITY_TEST_POSTS.filter(post => visiblePostIds.includes(post.id) && post.media.length > 0).map(post => post.id), communityMediaCount: mediaFixtures.filter(fixture=>visiblePostIds.includes(fixture.post.id)).length, gallerySizes: [...new Set(COMMUNITY_TEST_POSTS.filter(post=>visiblePostIds.includes(post.id)).map(post=>post.media.length))].sort() };
    await writeFile(required('IOS26_TEST_SAMPLES_MANIFEST_PATH'), `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write('ios26_test_samples_provisioned\n');
  } finally { await db.end({ timeout: 5 }); }
}
main().catch(error => { const code = error instanceof Error && /^test_sample_[a-z_]+$/.test(error.message) ? error.message : 'test_sample_provision_failed'; process.stderr.write(`${code}\n`); process.exitCode = 1; });
