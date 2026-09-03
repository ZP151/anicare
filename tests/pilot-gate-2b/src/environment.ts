export const HOSTED_PROJECT_REF = 'fhugdtpjbgiatqhvjioy' as const;
export const HOSTED_PROJECT_ORIGIN = 'https://fhugdtpjbgiatqhvjioy.supabase.co' as const;
export const HOSTED_POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com' as const;

export type HostedGateEnvironment = Readonly<{
  apiUrl: typeof HOSTED_PROJECT_ORIGIN;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  preciseLocationEncryptionKey: string;
  sourceCommit: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  firstOwnerFinalizeTimeoutMs: 5_000 | 30_000;
}>;

const INVALID = 'hosted_environment_invalid';
const COMMIT = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function invalid(): never {
  throw new Error(INVALID);
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || /[\r\n\0]/.test(value)) {
    return invalid();
  }
  return value;
}

function jwtRole(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as unknown;
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload) &&
      'role' in payload && typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function publicKey(value: string): string {
  if (/\s/.test(value)) return invalid();
  if (value.startsWith('sb_publishable_') && value.length > 'sb_publishable_'.length) return value;
  if (jwtRole(value) === 'anon') return value;
  return invalid();
}

function serviceKey(value: string): string {
  if (/\s/.test(value)) return invalid();
  if (value.startsWith('sb_secret_') && value.length > 'sb_secret_'.length) return value;
  if (jwtRole(value) === 'service_role') return value;
  return invalid();
}

function databaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalid();
  }
  if (
    parsed.protocol !== 'postgresql:' ||
    parsed.username !== `postgres.${HOSTED_PROJECT_REF}` ||
    parsed.password.length === 0 ||
    parsed.hostname !== HOSTED_POOLER_HOST ||
    parsed.port !== '5432' ||
    parsed.pathname !== '/postgres' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) return invalid();
  return value;
}

function encryptionKey(value: string): string {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return invalid();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength !== 32 || bytes.toString('base64') !== value) return invalid();
  return value;
}

function positiveInteger(value: string): number {
  if (!POSITIVE_INTEGER.test(value)) return invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) return invalid();
  return parsed;
}

function firstOwnerFinalizeTimeoutMs(value: string): 5_000 | 30_000 {
  if (value === '5000') return 5_000;
  if (value === '30000') return 30_000;
  return invalid();
}

export function readHostedGateEnvironment(source: NodeJS.ProcessEnv): HostedGateEnvironment {
  const apiUrl = required(source, 'SUPABASE_URL');
  if (apiUrl !== HOSTED_PROJECT_ORIGIN) return invalid();
  const anonKey = publicKey(required(source, 'SUPABASE_PUBLIC_KEY'));
  const serviceRoleKey = serviceKey(required(source, 'SUPABASE_SERVICE_ROLE_KEY'));
  if (anonKey === serviceRoleKey) return invalid();

  const sourceCommit = required(source, 'GITHUB_SHA');
  if (!COMMIT.test(sourceCommit)) return invalid();

  return {
    apiUrl,
    anonKey,
    serviceRoleKey,
    databaseUrl: databaseUrl(required(source, 'SUPABASE_DATABASE_URL')),
    preciseLocationEncryptionKey: encryptionKey(required(source, 'PRECISE_LOCATION_ENCRYPTION_KEY')),
    sourceCommit,
    workflowRunId: positiveInteger(required(source, 'GITHUB_RUN_ID')),
    workflowRunAttempt: positiveInteger(required(source, 'GITHUB_RUN_ATTEMPT')),
    firstOwnerFinalizeTimeoutMs: firstOwnerFinalizeTimeoutMs(
      required(source, 'PILOT_GATE_2B_FIRST_OWNER_FINALIZE_TIMEOUT_MS'),
    ),
  };
}
