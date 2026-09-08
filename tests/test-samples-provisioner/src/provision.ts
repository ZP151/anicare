import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const project = 'https://fhugdtpjbgiatqhvjioy.supabase.co';
const assets = ['orange.jpg', 'white.jpg', 'tabby.jpg', 'tuxedo.jpg'] as const;
const samples = [
  ['ios26-s01','00000000-0000-4000-8000-00000000a101','阿橘','orange.jpg','896520ca163ffff'],
  ['ios26-s02','00000000-0000-4000-8000-00000000a102','小白','white.jpg','896520ca163ffff'],
  ['ios26-s03','00000000-0000-4000-8000-00000000a103','狸花','tabby.jpg','89652636d87ffff'],
  ['ios26-s04','00000000-0000-4000-8000-00000000a104','小墨','tuxedo.jpg','896526add03ffff'],
  ['ios26-s05','00000000-0000-4000-8000-00000000a105','无图样本',null,'896526add03ffff'],
  ['ios26-s06','00000000-0000-4000-8000-00000000a106','旧活动样本',null,'89652636d87ffff'],
] as const;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error('test_sample_environment_invalid'); return value; }
function sha256(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function assetPath(filename: string) { return resolve(import.meta.dirname, '../../../docs/test-samples/ios-v1/assets', filename); }
async function main() {
  const url = required('SUPABASE_URL').replace(/\/$/, '');
  if (url !== project || process.env.CONFIRM_IOS26_TEST_SAMPLES !== 'yes') throw new Error('test_sample_target_refused');
  const databaseUrl = required('SUPABASE_DATABASE_URL');
  if (!databaseUrl.includes('fhugdtpjbgiatqhvjioy')) throw new Error('test_sample_database_refused');
  const db = postgres(databaseUrl, { max: 1, ssl: 'require', prepare: false, debug: false, onnotice: () => undefined });
  const storage = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(url, required('SUPABASE_PUBLIC_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    for (const [index, [key, id, alias, filename, cell]] of samples.entries()) {
      const label = `测试样本 S${String(index + 1).padStart(2, '0')}`;
      const path = filename ? `synthetic-test/${id}/portrait.jpg` : null;
      const bytes = filename ? await readFile(assetPath(filename)) : Buffer.from(`synthetic-test:${key}`);
      const sha = sha256(bytes);
      await db.begin(async sql => {
        await sql`select pg_advisory_xact_lock(hashtext(${key}))`;
        const existing = await sql`select fixture_key,animal_id,source_sha256 from private.test_sample_provisioning where fixture_key=${key}`;
        if (existing.length !== 0) {
          if (existing[0]!.animal_id !== id || existing[0]!.source_sha256 !== sha) throw new Error('test_sample_collision');
          return;
        }
        if (filename && path) {
          const downloaded = await storage.storage.from('cat-portraits').download(path);
          if (downloaded.data) {
            if (sha256(new Uint8Array(await downloaded.data.arrayBuffer())) !== sha) throw new Error('test_sample_portrait_collision');
          } else {
            const uploaded = await storage.storage.from('cat-portraits').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
            if (uploaded.error) throw new Error('test_sample_portrait_upload_failed');
          }
        }
        await sql`insert into public.animals(id,primary_alias,verification,lifecycle,visibility,identity_origin_required,confirmed_photo_count) values(${id}::uuid,${alias + ' ' + label},'reported','active','public',false,0)`;
        await sql`insert into public.animal_aliases(animal_id,alias) values(${id}::uuid,${label})`;
        await sql`insert into public.sightings(animal_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,notes,client_dedupe_key) values(${id}::uuid,now()-case when ${index} < 4 then interval '6 hours' else interval '8 days' end,${cell},'morning','normal','public',now()-case when ${index} < 4 then interval '5 hours' else interval '7 days' end,'{"source":"synthetic_test","provenance":"reported"}'::jsonb,'Synthetic test sample; not a human confirmation.',${key + '-sighting'})`;
        await sql`insert into public.care_events(animal_id,activity,completed_at,public_cell_id,notes,client_dedupe_key,visibility,visible_at) values(${id}::uuid,'feed',now()-case when ${index} < 4 then interval '4 hours' else interval '6 days' end,${cell},'Synthetic reported care test sample.',${key + '-care'},'public',now()-case when ${index} < 4 then interval '3 hours' else interval '5 days' end)`;
        await sql`insert into private.cat_presentations(animal_id,portrait_path,sample_label,source_metadata) values(${id}::uuid,${path},${label},jsonb_build_object('provenance','synthetic_test','training_eligible',false,'fixture_key',${key}))`;
        await sql`insert into private.test_sample_provisioning(fixture_key,animal_id,source_sha256) values(${key},${id}::uuid,${sha})`;
      });
    }
    const ids = samples.map(([, id]) => id);
    const presentations = await anonymous.rpc('get_public_cat_presentations', { p_animal_ids: ids });
    if (presentations.error || !Array.isArray(presentations.data) || presentations.data.length !== 6) throw new Error('test_sample_public_read_failed');
    const rows = presentations.data as Array<{ animalId: string; portraitPath: string | null }>;
    for (const row of rows.filter((row) => row.portraitPath !== null)) {
      const signed = await anonymous.storage.from('cat-portraits').createSignedUrl(row.portraitPath!, 60);
      if (signed.error || !signed.data?.signedUrl || !(await fetch(signed.data.signedUrl)).ok) throw new Error('test_sample_signed_portrait_failed');
    }
    process.stdout.write(JSON.stringify({ projectRef: 'fhugdtpjbgiatqhvjioy', fixtureKeys: samples.map(([key]) => key), portraitCount: assets.length }) + '\n');
  } finally { await db.end({ timeout: 5 }); }
}
main().catch(() => { process.stderr.write('test_sample_provision_failed\n'); process.exitCode = 1; });
