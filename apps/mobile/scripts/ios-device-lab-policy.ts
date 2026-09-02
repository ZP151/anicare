export type DeviceLabMode = 'compile_probe' | 'device_candidate';

export type DeviceLabInputCode =
  | 'event_not_allowed'
  | 'compile_probe_placeholder_invalid'
  | 'manual_ref_invalid'
  | 'maps_ios_key_missing'
  | 'maps_ios_key_whitespace'
  | 'maps_ios_key_placeholder'
  | 'supabase_url_missing'
  | 'supabase_url_whitespace'
  | 'supabase_url_invalid'
  | 'supabase_public_key_missing'
  | 'supabase_public_key_whitespace'
  | 'supabase_public_key_placeholder'
  | 'supabase_public_key_privileged'
  | 'supabase_public_key_invalid';

export type Gate2BReadinessCode =
  | 'evidence_shape_invalid'
  | 'evidence_schema_version_invalid'
  | 'evidence_project_invalid'
  | 'evidence_checks_failed'
  | 'evidence_timestamps_invalid'
  | 'evidence_expired'
  | 'candidate_commit_invalid'
  | 'evidence_source_not_ancestor'
  | 'evidence_migration_head_mismatch'
  | 'evidence_edge_functions_tree_mismatch';

const hostedProjectRef = 'fhugdtpjbgiatqhvjioy';
const hostedOrigin = 'https://fhugdtpjbgiatqhvjioy.supabase.co';
const compileProbe = {
  googleMapsIosApiKey: 'compile-probe-google-maps-ios-key',
  supabaseUrl: 'https://compile-probe.invalid',
  supabasePublicKey: 'compile-probe-supabase-public-key',
} as const;
const knownPlaceholders = new Set([
  compileProbe.googleMapsIosApiKey,
  compileProbe.supabasePublicKey,
  'YOUR_GOOGLE_MAPS_IOS_API_KEY',
  'GOOGLE_MAPS_IOS_API_KEY',
  'YOUR_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
]);
const evidenceKeys = new Set([
  'schemaVersion',
  'projectRef',
  'projectOrigin',
  'sourceCommit',
  'migrationHead',
  'edgeFunctionsTreeSha256',
  'workflowRunId',
  'workflowRunAttempt',
  'createdAt',
  'expiresAt',
  'authRedirectCheck',
  'mediaStagingCheck',
  'publicKeyOriginCheck',
  'syntheticOwnerHappyPath',
  'crossOwnerIsolation',
]);
const requiredEvidenceKeys = [...evidenceKeys];
const readinessChecks = [
  'authRedirectCheck',
  'mediaStagingCheck',
  'publicKeyOriginCheck',
  'syntheticOwnerHappyPath',
  'crossOwnerIsolation',
] as const;
const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type RecordValue = Readonly<Record<string, unknown>>;
type Gate2BEvidence = Readonly<{
  schemaVersion: number;
  projectRef: string;
  projectOrigin: string;
  sourceCommit: string;
  migrationHead: Readonly<{ filename: string; sha256: string }>;
  edgeFunctionsTreeSha256: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  createdAt: string;
  expiresAt: string;
  authRedirectCheck: 'passed' | 'failed';
  mediaStagingCheck: 'passed' | 'failed';
  publicKeyOriginCheck: 'passed' | 'failed';
  syntheticOwnerHappyPath: 'passed' | 'failed';
  crossOwnerIsolation: 'passed' | 'failed';
}>;

export function evaluateDeviceLabInputs(input: Readonly<{
  eventName: string;
  ref: string;
  googleMapsIosApiKey?: string;
  supabaseUrl?: string;
  supabasePublicKey?: string;
}>): Readonly<{ ok: true; mode: DeviceLabMode }> | Readonly<{
  ok: false;
  codes: readonly DeviceLabInputCode[];
}> {
  if (input.eventName === 'pull_request') {
    const hasRepositoryPlaceholders =
      input.googleMapsIosApiKey === compileProbe.googleMapsIosApiKey &&
      input.supabaseUrl === compileProbe.supabaseUrl &&
      input.supabasePublicKey === compileProbe.supabasePublicKey;
    return hasRepositoryPlaceholders
      ? { ok: true, mode: 'compile_probe' }
      : { ok: false, codes: ['compile_probe_placeholder_invalid'] };
  }

  if (input.eventName !== 'workflow_dispatch') {
    return { ok: false, codes: ['event_not_allowed'] };
  }

  const codes: DeviceLabInputCode[] = [];
  if (input.ref !== 'refs/heads/main') {
    codes.push('manual_ref_invalid');
  }
  addMapsKeyCode(codes, input.googleMapsIosApiKey);
  addSupabaseUrlCode(codes, input.supabaseUrl);
  addSupabasePublicKeyCode(codes, input.supabasePublicKey);

  return codes.length === 0
    ? { ok: true, mode: 'device_candidate' }
    : { ok: false, codes };
}

function addMapsKeyCode(codes: DeviceLabInputCode[], value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    codes.push('maps_ios_key_missing');
  } else if (/\s/.test(value)) {
    codes.push('maps_ios_key_whitespace');
  } else if (knownPlaceholders.has(value)) {
    codes.push('maps_ios_key_placeholder');
  }
}

function addSupabaseUrlCode(codes: DeviceLabInputCode[], value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    codes.push('supabase_url_missing');
  } else if (/\s/.test(value)) {
    codes.push('supabase_url_whitespace');
  } else if (value !== hostedOrigin) {
    codes.push('supabase_url_invalid');
  }
}

function addSupabasePublicKeyCode(codes: DeviceLabInputCode[], value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    codes.push('supabase_public_key_missing');
  } else if (/\s/.test(value)) {
    codes.push('supabase_public_key_whitespace');
  } else if (knownPlaceholders.has(value)) {
    codes.push('supabase_public_key_placeholder');
  } else if (value.startsWith('sb_secret_') || value.includes('service_role') || decodedJwtRole(value) === 'service_role') {
    codes.push('supabase_public_key_privileged');
  } else if (!isPublicSupabaseKey(value)) {
    codes.push('supabase_public_key_invalid');
  }
}

function isPublicSupabaseKey(value: string): boolean {
  if (value.startsWith('sb_publishable_')) {
    return value.length > 'sb_publishable_'.length;
  }

  return decodedJwtRole(value) === 'anon';
}

function decodedJwtRole(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
    return isRecord(payload) && typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactEvidenceShape(value: unknown): value is Gate2BEvidence {
  if (!isRecord(value)) return false;
  const workflowRunId = value.workflowRunId;
  const workflowRunAttempt = value.workflowRunAttempt;
  if (
    Object.keys(value).some((key) => !evidenceKeys.has(key)) ||
    requiredEvidenceKeys.some((key) => !(key in value)) ||
    typeof value.schemaVersion !== 'number' ||
    typeof value.projectRef !== 'string' ||
    typeof value.projectOrigin !== 'string' ||
    typeof value.sourceCommit !== 'string' ||
    !commitPattern.test(value.sourceCommit) ||
    !isRecord(value.migrationHead) ||
    Object.keys(value.migrationHead).length !== 2 ||
    typeof value.migrationHead.filename !== 'string' ||
    value.migrationHead.filename.length === 0 ||
    typeof value.migrationHead.sha256 !== 'string' ||
    !sha256Pattern.test(value.migrationHead.sha256) ||
    typeof value.edgeFunctionsTreeSha256 !== 'string' ||
    !sha256Pattern.test(value.edgeFunctionsTreeSha256) ||
    typeof workflowRunId !== 'number' || !Number.isSafeInteger(workflowRunId) || workflowRunId < 1 ||
    typeof workflowRunAttempt !== 'number' || !Number.isSafeInteger(workflowRunAttempt) || workflowRunAttempt < 1 ||
    typeof value.createdAt !== 'string' || !isTimestamp(value.createdAt) ||
    typeof value.expiresAt !== 'string' || !isTimestamp(value.expiresAt) ||
    readinessChecks.some((key) => value[key] !== 'passed' && value[key] !== 'failed')
  ) {
    return false;
  }
  return true;
}

function isTimestamp(value: string): boolean {
  if (!timestampPattern.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function evaluateGate2BReadiness(input: Readonly<{
  evidence: unknown;
  nowIso: string;
  candidateCommit: string;
  isAncestor: (source: string, candidate: string) => boolean;
  migrationHead: Readonly<{ filename: string; sha256: string }>;
  edgeFunctionsTreeSha256: string;
}>): readonly Gate2BReadinessCode[] {
  if (!hasExactEvidenceShape(input.evidence)) {
    return ['evidence_shape_invalid'];
  }
  if (!commitPattern.test(input.candidateCommit)) {
    return ['candidate_commit_invalid'];
  }

  const evidence = input.evidence;
  const codes: Gate2BReadinessCode[] = [];
  if (evidence.schemaVersion !== 1) {
    codes.push('evidence_schema_version_invalid');
  }
  if (evidence.projectRef !== hostedProjectRef || evidence.projectOrigin !== hostedOrigin) {
    codes.push('evidence_project_invalid');
  }
  if (readinessChecks.some((key) => evidence[key] !== 'passed')) {
    codes.push('evidence_checks_failed');
  }

  const nowIsValid = isTimestamp(input.nowIso);
  const now = new Date(input.nowIso).getTime();
  const createdAt = new Date(evidence.createdAt).getTime();
  const expiresAt = new Date(evidence.expiresAt).getTime();
  const windowMs = expiresAt - createdAt;
  if (!nowIsValid || now < createdAt || windowMs <= 0 || windowMs > 72 * 60 * 60 * 1000) {
    codes.push('evidence_timestamps_invalid');
  } else if (now >= expiresAt) {
    codes.push('evidence_expired');
  }

  try {
    if (!input.isAncestor(evidence.sourceCommit, input.candidateCommit)) {
      codes.push('evidence_source_not_ancestor');
    }
  } catch {
    codes.push('evidence_source_not_ancestor');
  }
  if (
    evidence.migrationHead.filename !== input.migrationHead.filename ||
    evidence.migrationHead.sha256 !== input.migrationHead.sha256
  ) {
    codes.push('evidence_migration_head_mismatch');
  }
  if (evidence.edgeFunctionsTreeSha256 !== input.edgeFunctionsTreeSha256) {
    codes.push('evidence_edge_functions_tree_mismatch');
  }
  return codes;
}
