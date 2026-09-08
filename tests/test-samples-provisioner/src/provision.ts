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
async function main() {
  const url = required('SUPABASE_URL').replace(/\/$/, '');
  if (url !== project || process.env.CONFIRM_IOS26_TEST_SAMPLES !== 'yes') throw new Error('test_sample_target_refused');
  const db = postgres(required('SUPABASE_DATABASE_URL'), { max: 1, ssl: 'require', prepare: false, debug: false, onnotice: () => undefined });
  const storage = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    for (const [index, [key, id, alias, filename, cell]] of samples.entries()) {
      const label = `测试样本 S${String(index + 1).padStart(2, '0')}`;
      const path = filename ? `synthetic-test/${id}/portrait.jpg` : null;
      const bytes = filename ? await readFile(resolve('docs/test-samples/ios-v1/assets', filename)) : Buffer.from(`synthetic-test:${key}`);
      const sha = createHash('sha256').update(bytes).digest('hex');
      const existing = await db`select fixture_key from private.test_sample_provisioning where fixture_key=${key}`;
      if (existing.length !== 0) continue; // A prior run owns this fixture; never overwrite user modifications.
      if (filename && path) {
        const { error } = await storage.storage.from('cat-portraits').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
        if (error) throw new Error('test_sample_portrait_upload_failed');
      }
      await db.begin(async sql => {
        await sql`insert into private.test_sample_provisioning(fixture_key,animal_id,source_sha256) values(${key},${id}::uuid,${sha})`;
        await sql`insert into public.animals(id,primary_alias,verification,lifecycle,visibility,identity_origin_required,confirmed_photo_count) values(${id}::uuid,${alias},'reported','active','public',false,0)`;
        await sql`insert into public.animal_aliases(animal_id,alias) values(${id}::uuid,${label})`;
        await sql`insert into public.sightings(animal_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,notes,client_dedupe_key) values(${id}::uuid,now()-interval '8 days',${cell},'morning','normal','public',now()-interval '7 days','{"source":"synthetic_test","provenance":"reported"}'::jsonb,'Synthetic test sample; not a human confirmation.',${key + '-sighting'})`;
        await sql`insert into public.care_events(animal_id,activity,completed_at,public_cell_id,notes,client_dedupe_key,visibility,visible_at) values(${id}::uuid,'feed',now()-interval '6 days',${cell},'Synthetic reported care test sample.',${key + '-care'},'public',now()-interval '5 days')`;
        await sql`insert into private.cat_presentations(animal_id,portrait_path,sample_label,source_metadata) values(${id}::uuid,${path},${label},jsonb_build_object('provenance','synthetic_test','training_eligible',false,'fixture_key',${key}))`;
      });
    }
  } finally { await db.end({ timeout: 5 }); }
}
main().catch(() => { process.stderr.write('test_sample_provision_failed\n'); process.exitCode = 1; });
