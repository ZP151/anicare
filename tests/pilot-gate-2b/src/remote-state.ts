import postgres from 'postgres';

import type { HostedGateEnvironment } from './environment.js';

const MIGRATION_FILES = [
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
] as const;

export const EXPECTED_REMOTE_MIGRATIONS = MIGRATION_FILES.map((filename) => {
  const match = /^(\d{12,14})_(.+)\.sql$/.exec(filename);
  if (!match) throw new Error('remote_migrations_invalid');
  return Object.freeze({ version: match[1]!, name: match[2]! });
});

type RemoteMigrationAdapter = Readonly<{
  query(): Promise<unknown>;
  close(): Promise<void>;
}>;

function defaultAdapter(env: HostedGateEnvironment): RemoteMigrationAdapter {
  const sql = postgres(env.databaseUrl, {
    max: 1, connect_timeout: 5, idle_timeout: 5, max_lifetime: 15, prepare: false,
    ssl: 'require', debug: false, onnotice: () => undefined,
    connection: { statement_timeout: 8_000, lock_timeout: 1_000 },
  });
  return {
    query: async () => await sql<Array<{ version: string; name: string }>>`
      select version, name
      from supabase_migrations.schema_migrations
      order by version
    `,
    close: async () => { await sql.end({ timeout: 2 }); },
  };
}

export async function verifyRemoteMigrationInventory(
  env: HostedGateEnvironment,
  providedAdapter?: RemoteMigrationAdapter,
): Promise<void> {
  const adapter = providedAdapter ?? defaultAdapter(env);
  try {
    const rows = await adapter.query();
    if (!Array.isArray(rows) || rows.length !== EXPECTED_REMOTE_MIGRATIONS.length || rows.some((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== 2 ||
          !Object.hasOwn(row, 'version') || !Object.hasOwn(row, 'name')) return true;
      const value = row as Record<string, unknown>;
      const expected = EXPECTED_REMOTE_MIGRATIONS[index];
      return !expected || value.version !== expected.version || value.name !== expected.name;
    })) throw new Error('invalid');
  } catch {
    throw new Error('remote_migrations_invalid');
  } finally {
    await adapter.close().catch(() => undefined);
  }
}
