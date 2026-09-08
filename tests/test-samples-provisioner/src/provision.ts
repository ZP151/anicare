import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { ensurePortrait } from './portrait.js';
import { samples, legacyEnglishNames, samplePlaces } from './fixtures.js';

const project = 'https://fhugdtpjbgiatqhvjioy.supabase.co';

function required(name: string) { const value = process.env[name]; if (!value) throw new Error('test_sample_environment_invalid'); return value; }
function sha256(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function assetPath(filename: string) { return resolve(import.meta.dirname, '../../../docs/test-samples/ios-v1/assets', filename); }
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
async function main() {
  const url = required('SUPABASE_URL').replace(/\/$/, '');
  if (url !== project || process.env.CONFIRM_IOS26_TEST_SAMPLES !== 'yes') throw new Error('test_sample_target_refused');
  const databaseUrl = required('SUPABASE_DATABASE_URL');
  if (!validDatabaseTarget(databaseUrl)) throw new Error('test_sample_database_refused');
  const provenance = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../docs/test-samples/ios-v1/asset-provenance.json'), 'utf8')) as {assets: Array<{file:string;source:string;sha256:string}>};
  for (const filename of new Set(samples.flatMap(sample => sample[3] ? [sample[3]] : []))) {
    const approved = provenance.assets.find(asset => asset.file === `assets/${filename}` && asset.source === 'synthetic_test');
    if (!approved || sha256(await readFile(assetPath(filename))) !== approved.sha256) throw new Error('test_sample_asset_not_approved');
  }
  const db = postgres(databaseUrl, { max: 1, ssl: 'require', prepare: false, debug: false, onnotice: () => undefined });
  const storage = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(url, required('SUPABASE_PUBLIC_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
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
          if (existing[0]!.animal_id !== id || existing[0]!.source_sha256 !== sha) throw new Error('test_sample_collision');
          // Only upgrade the original untouched fixture name; never overwrite a later user edit.
          if (english) {
            await sql`insert into public.animal_aliases(animal_id,alias) values(${id}::uuid,${english}) on conflict(animal_id,alias) do nothing`;
            await sql`update public.animals set primary_alias=${displayAlias+' '+label} where id=${id}::uuid and primary_alias=${alias+' '+label}`;
          }
          if(place) await sql`update public.sightings set traits=jsonb_set(traits,'{public_place}',${JSON.stringify(place)}::jsonb) where animal_id=${id}::uuid and client_dedupe_key=${key+'-sighting'} and traits->>'source'='synthetic_test' and not traits ? 'public_place'`;
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
        if(place) await sql`update public.sightings set traits=jsonb_set(traits,'{public_place}',${JSON.stringify(place)}::jsonb) where animal_id=${id}::uuid and client_dedupe_key=${key+'-sighting'}`;
      });
    }
    const ids = samples.map(([, id]) => id);
    const presentations = await anonymous.rpc('get_public_cat_presentations', { p_animal_ids: ids });
    if (presentations.error || !Array.isArray(presentations.data) || presentations.data.length !== samples.length) throw new Error('test_sample_public_read_failed');
    const rows = presentations.data as Array<{ animalId: string; portraitPath: string | null; sampleLabel: string }>;
    if (new Set(rows.map((row) => row.animalId)).size !== samples.length || new Set(rows.map((row) => row.sampleLabel)).size !== samples.length) throw new Error('test_sample_public_projection_invalid');
    const portraitRows = rows.filter(row => row.portraitPath !== null);
    if (portraitRows.length !== samples.filter(sample=>sample[3]).length || ids.some(id => !rows.some(row => row.animalId === id))) throw new Error('test_sample_public_projection_invalid');
    for (const row of portraitRows) {
      const signed = await anonymous.storage.from('cat-portraits').createSignedUrl(row.portraitPath!, 60);
      const response = signed.data?.signedUrl ? await fetch(signed.data.signedUrl) : null;
      const filename = samples.find(sample => sample[1] === row.animalId)?.[3];
      if (!filename || row.portraitPath !== `synthetic-test/${row.animalId}/portrait.jpg`) throw new Error('test_sample_public_projection_invalid');
      const expected = await readFile(assetPath(filename));
      if (signed.error || !response?.ok || !response.headers.get('content-type')?.startsWith('image/jpeg') || sha256(new Uint8Array(await response.arrayBuffer())) !== sha256(expected)) throw new Error('test_sample_signed_portrait_failed');
    }
    for (const id of ids) {
      const summary = await anonymous.rpc('get_public_cat_summary', { p_animal_id: id });
      const care = await anonymous.rpc('list_public_care_history', { p_animal_id: id, p_cursor: null, p_limit: 20 });
      if (summary.error || !Array.isArray(summary.data) || summary.data.length !== 1 || care.error || !Array.isArray(care.data) || care.data.length < 1) throw new Error('test_sample_public_journey_failed');
      const fixture=samples.find(sample=>sample[1]===id)!;
      const activity=await anonymous.rpc('list_public_cat_community_activity',{p_animal_id:id});
      if(activity.error || !Array.isArray(activity.data) || !activity.data.some(row=>row.publicCellId===fixture[4])) throw new Error('test_sample_map_activity_failed');
      const expectedPlace=samplePlaces[fixture[0]];
      if(expectedPlace && !activity.data.some(row=>row.residenceName===expectedPlace.name && row.residenceType===expectedPlace.residenceType))throw new Error('test_sample_building_context_failed');
    }
    for (const cell of new Set(samples.map(([, , , , cell]) => cell))) {
      const discovery = await anonymous.rpc('list_public_cat_discovery', { p_public_cell_id: cell, p_verifications: null, p_cursor: null, p_limit: 50 });
      if (discovery.error || !Array.isArray(discovery.data) || discovery.data.length < 1) throw new Error('test_sample_discovery_failed');
    }
    const manifest = { projectRef: 'fhugdtpjbgiatqhvjioy', fixtureKeys: samples.map(([key]) => key), portraitCount: portraitRows.length };
    await writeFile(required('IOS26_TEST_SAMPLES_MANIFEST_PATH'), `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write('ios26_test_samples_provisioned\n');
  } finally { await db.end({ timeout: 5 }); }
}
main().catch(error => { const code = error instanceof Error && /^test_sample_[a-z_]+$/.test(error.message) ? error.message : 'test_sample_provision_failed'; process.stderr.write(`${code}\n`); process.exitCode = 1; });
