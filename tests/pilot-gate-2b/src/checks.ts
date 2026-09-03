import type { HostedGateEnvironment } from './environment.js';
import type { ReadinessChecks } from './evidence.js';
import type { ActorResult } from '../../pilot-gate-2a/src/actors.js';

const AUTH_CONFIGURATION = {
  siteUrl: 'animalhelper://',
  additionalRedirectUrls: ['animalhelper://auth/callback'],
} as const;
const STAGING_CONFIGURATION = {
  bucket: 'media-staging',
  public: false,
  fileSizeLimit: 20 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg'],
} as const;

export const HOSTED_CHECK_IDS = [
  'auth_redirect', 'public_origin', 'owner_happy_path', 'media_staging', 'cross_owner_isolation',
] as const;
export type HostedCheckId = typeof HOSTED_CHECK_IDS[number];

export const HOSTED_MEDIA_STAGING_STEPS = [
  'prerequisite_state', 'bucket_configuration', 'stranger_reservation', 'isolation_snapshot',
  'isolation_jobs', 'isolation_assets', 'isolation_objects', 'isolation_validation',
  'privacy_read_actual', 'privacy_read_unknown', 'privacy_read_equivalence', 'privacy_list',
  'isolation_compare', 'owner_unchanged',
] as const;
export type HostedMediaStagingStep = typeof HOSTED_MEDIA_STAGING_STEPS[number];

export const HOSTED_OWNER_HAPPY_PATH_STEPS = [
  'ledger_media', 'reserve', 'ledger_reserve', 'upload', 'finalize',
  'ledger_asset', 'inspect', 'replay', 'verify',
] as const;
export type HostedOwnerHappyPathStep = typeof HOSTED_OWNER_HAPPY_PATH_STEPS[number];

export const HOSTED_OWNER_FINALIZE_OUTCOMES = [
  'network',
  'http_401_authentication_required',
  'http_403_media_not_found_or_forbidden',
  'http_403_unclassified',
  'http_409_media_finalization_conflict',
  'http_503_service_unavailable',
  'http_other',
  'invalid_response',
] as const;
export type HostedOwnerFinalizeOutcome = typeof HOSTED_OWNER_FINALIZE_OUTCOMES[number];

export class HostedCheckFailure extends Error {
  constructor(
    readonly checkId: HostedCheckId,
    readonly mediaStep?: HostedMediaStagingStep,
    readonly ownerStep?: HostedOwnerHappyPathStep,
    readonly ownerFinalizeOutcome?: HostedOwnerFinalizeOutcome,
  ) {
    super('hosted_checks_failed');
  }
}

export function hostedCheckIdFromError(error: unknown): HostedCheckId | undefined {
  return error instanceof HostedCheckFailure ? error.checkId : undefined;
}

export function hostedMediaStepFromError(error: unknown): HostedMediaStagingStep | undefined {
  if (!(error instanceof HostedCheckFailure) || error.checkId !== 'media_staging' ||
      typeof error.mediaStep !== 'string' ||
      !(HOSTED_MEDIA_STAGING_STEPS as readonly string[]).includes(error.mediaStep)) return undefined;
  return error.mediaStep;
}

export function hostedOwnerStepFromError(error: unknown): HostedOwnerHappyPathStep | undefined {
  if (!(error instanceof HostedCheckFailure) || error.checkId !== 'owner_happy_path' ||
      typeof error.ownerStep !== 'string' ||
      !(HOSTED_OWNER_HAPPY_PATH_STEPS as readonly string[]).includes(error.ownerStep)) return undefined;
  return error.ownerStep;
}

export function ownerFinalizeOutcomeFromActorResult(result: ActorResult | unknown): HostedOwnerFinalizeOutcome | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const candidate = result as Record<string, unknown>;
  if (candidate.ok === true) return undefined;
  if (candidate.ok !== false || candidate.stage !== 'finalize' || typeof candidate.kind !== 'string' ||
      typeof candidate.code !== 'string') return undefined;
  if (candidate.kind === 'network') {
    return candidate.status === null && candidate.code === 'network_error' ? 'network' : undefined;
  }
  if (candidate.kind === 'invalid_response') {
    return candidate.status === null && candidate.code === 'invalid_response' ? 'invalid_response' : undefined;
  }
  if (candidate.kind !== 'http' || !Number.isInteger(candidate.status) ||
      (candidate.status as number) < 100 || (candidate.status as number) > 599) return undefined;
  if (candidate.status === 401 && candidate.code === 'authentication_required') return 'http_401_authentication_required';
  if (candidate.status === 403) {
    return candidate.code === 'media_not_found_or_forbidden'
      ? 'http_403_media_not_found_or_forbidden'
      : 'http_403_unclassified';
  }
  if (candidate.status === 409 && candidate.code === 'media_finalization_conflict') {
    return 'http_409_media_finalization_conflict';
  }
  if (candidate.status === 503 && candidate.code === 'service_unavailable') return 'http_503_service_unavailable';
  return 'http_other';
}

export function hostedOwnerFinalizeOutcomeFromError(error: unknown): HostedOwnerFinalizeOutcome | undefined {
  if (!(error instanceof HostedCheckFailure) || error.checkId !== 'owner_happy_path' || error.ownerStep !== 'finalize' ||
      typeof error.ownerFinalizeOutcome !== 'string' ||
      !(HOSTED_OWNER_FINALIZE_OUTCOMES as readonly string[]).includes(error.ownerFinalizeOutcome)) return undefined;
  return error.ownerFinalizeOutcome;
}

export type HostedCheckAdapter = Readonly<{
  verifyAuthRedirects(configuration: typeof AUTH_CONFIGURATION): Promise<boolean>;
  verifyMediaStaging(configuration: typeof STAGING_CONFIGURATION): Promise<boolean>;
  verifyPublicKeyOrigin(origin: string): Promise<boolean>;
  runOwnerHappyPath(): Promise<boolean>;
  verifyCrossOwnerIsolation(): Promise<boolean>;
}>;

async function requirePassed(checkId: HostedCheckId, operation: () => Promise<boolean>): Promise<void> {
  let passed = false;
  let mediaStep: HostedMediaStagingStep | undefined;
  let ownerStep: HostedOwnerHappyPathStep | undefined;
  let ownerFinalizeOutcome: HostedOwnerFinalizeOutcome | undefined;
  try {
    passed = await operation();
  } catch (error) {
    mediaStep = hostedMediaStepFromError(error);
    ownerStep = hostedOwnerStepFromError(error);
    ownerFinalizeOutcome = hostedOwnerFinalizeOutcomeFromError(error);
    passed = false;
  }
  if (!passed) throw new HostedCheckFailure(
    checkId,
    checkId === 'media_staging' ? mediaStep : undefined,
    checkId === 'owner_happy_path' ? ownerStep : undefined,
    checkId === 'owner_happy_path' && ownerStep === 'finalize' ? ownerFinalizeOutcome : undefined,
  );
}

export async function runHostedChecks(
  env: HostedGateEnvironment,
  adapter: HostedCheckAdapter,
): Promise<ReadinessChecks> {
  await requirePassed('auth_redirect', () => adapter.verifyAuthRedirects(AUTH_CONFIGURATION));
  await requirePassed('public_origin', () => adapter.verifyPublicKeyOrigin(env.apiUrl));
  await requirePassed('owner_happy_path', () => adapter.runOwnerHappyPath());
  await requirePassed('media_staging', () => adapter.verifyMediaStaging(STAGING_CONFIGURATION));
  await requirePassed('cross_owner_isolation', () => adapter.verifyCrossOwnerIsolation());
  return {
    authRedirectCheck: 'passed',
    mediaStagingCheck: 'passed',
    publicKeyOriginCheck: 'passed',
    syntheticOwnerHappyPath: 'passed',
    crossOwnerIsolation: 'passed',
  };
}
