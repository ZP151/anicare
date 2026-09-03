import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const REVIEWED_MIGRATIONS = Object.freeze([
  '202608260001_initial_core.sql',
  '202608260002_retention_and_deletion.sql',
  '202608270001_safe_media_staging.sql',
  '202608270002_safe_public_and_safety_rpcs.sql',
  '202608270003_moderation_actions.sql',
  '202608270004_moderation_hold_safety.sql',
  '202608270005_account_erasure_and_block_oracle.sql',
  '202608270006_legacy_media_erasure_and_guard_hardening.sql',
  '202608270007_sighting_submission_recovery.sql',
  '202608290001_identity_review_control_plane.sql',
  '202608310001_identity_assistance_job_foundation.sql',
  '202608310002_identity_assistance_state_guards.sql',
  '202608310003_identity_assistance_state_guards_review_fixes.sql',
  '202608310004_identity_assistance_media_invalidation.sql',
  '202608310005_identity_assistance_erasure_locking.sql',
  '202608310006_identity_assistance_service_lifecycle.sql',
  '202608310007_identity_assistance_service_completion.sql',
  '202608310008_revoke_legacy_ai_proposal_bridge.sql',
  '202608310009_report_manual_area_submission.sql',
  '202608310010_my_reports_projection.sql',
]);

export const DEPLOYED_FUNCTIONS = Object.freeze([
  'cleanup-legacy-media', 'cleanup-media-staging', 'create-sighting',
  'delete-media', 'finalize-media-upload', 'reserve-media-upload',
]);

const FIXED_FILES = Object.freeze({
  integration: 'tests/pilot-gate-2b/src/hosted.integration.test.ts',
  schema: 'docs/evidence/pilot-gate-2b-readiness.schema.json',
  workflow: '.github/workflows/hosted-gate-2b.yml',
});

function invalidInputs() { throw new Error('pilot_gate_2b_inputs_invalid'); }

function inside(root, target) {
  const child = path.relative(root, target);
  return child.length > 0 && child !== '..' && !child.startsWith(`..${path.sep}`) && !path.isAbsolute(child);
}

function fixedFile(root, relativePath, maxBytes = 2 * 1024 * 1024) {
  const target = path.resolve(root, ...relativePath.split('/'));
  let link;
  try { link = lstatSync(target); } catch { return invalidInputs(); }
  if (!link.isFile() || link.isSymbolicLink() || link.size < 1 || link.size > maxBytes) return invalidInputs();
  const real = realpathSync(target);
  if (!inside(root, real) || !statSync(real).isFile()) return invalidInputs();
}

function deploymentTree(root) {
  const supabaseRoot = realpathSync(path.join(root, 'supabase'));
  const targets = [path.join(supabaseRoot, 'config.toml'), path.join(supabaseRoot, 'migrations'), path.join(supabaseRoot, 'functions')];
  const files = [];
  const walk = (target) => {
    const link = lstatSync(target);
    if (link.isSymbolicLink()) return invalidInputs();
    if (link.isDirectory()) {
      for (const name of readdirSync(target).sort()) {
        if (['node_modules', 'dist', '.turbo'].includes(name)) continue;
        walk(path.join(target, name));
      }
      return;
    }
    if (!link.isFile() || link.size < 1 || link.size > 2 * 1024 * 1024) return invalidInputs();
    const real = realpathSync(target);
    if (!inside(supabaseRoot, real) || !statSync(real).isFile()) return invalidInputs();
    files.push(real);
  };
  for (const target of targets) walk(target);
  files.sort((left, right) => path.relative(supabaseRoot, left).replaceAll('\\', '/').localeCompare(
    path.relative(supabaseRoot, right).replaceAll('\\', '/')));
  const hash = createHash('sha256');
  hash.update('animalhelper-hosted-deployment-tree-v1\0');
  let total = 0;
  for (const file of files) {
    const name = path.relative(supabaseRoot, file).replaceAll('\\', '/');
    const bytes = readFileSync(file);
    total += bytes.byteLength;
    if (total > 32 * 1024 * 1024) return invalidInputs();
    hash.update(`${Buffer.byteLength(name)}:${name}\0${bytes.byteLength}:`);
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function discoverPilotGate2BInputs(repoRoot) {
  const root = realpathSync(path.resolve(repoRoot));
  if (!statSync(root).isDirectory()) return invalidInputs();
  const migrationDirectory = path.join(root, 'supabase', 'migrations');
  const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).map((entry) => entry.name).sort();
  if (JSON.stringify(migrations) !== JSON.stringify(REVIEWED_MIGRATIONS)) return invalidInputs();
  for (const name of migrations) fixedFile(root, `supabase/migrations/${name}`);

  const functionDirectory = path.join(root, 'supabase', 'functions');
  const functions = readdirSync(functionDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !['_shared', '.turbo', 'dist', 'node_modules'].includes(entry.name))
    .map((entry) => entry.name).sort();
  if (JSON.stringify(functions) !== JSON.stringify(DEPLOYED_FUNCTIONS)) return invalidInputs();
  for (const name of functions) fixedFile(root, `supabase/functions/${name}/index.ts`);
  for (const relativePath of Object.values(FIXED_FILES)) fixedFile(root, relativePath);
  return {
    migrations: [...REVIEWED_MIGRATIONS], functions: [...DEPLOYED_FUNCTIONS], ...FIXED_FILES,
    deploymentTreeSha256: deploymentTree(root),
  };
}

export function validatePilotGate2BInputs(input) {
  const bootstrap = input?.eventName === 'push' && input?.ref === 'refs/heads/codex/hosted-gate-2b';
  const refresh = input?.eventName === 'workflow_dispatch' && input?.ref === 'refs/heads/main';
  if (input?.repository !== 'ZP151/anicare' || (!bootstrap && !refresh) ||
      input?.environment !== 'hosted-gate-2b' || input?.projectRef !== 'fhugdtpjbgiatqhvjioy' ||
      typeof input?.sha !== 'string' || !/^[a-f0-9]{40}$/.test(input.sha)) {
    throw new Error('pilot_gate_2b_context_invalid');
  }
}
