import type { HostedGateEnvironment } from './environment.js';
import type { ReadinessChecks } from './evidence.js';

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
  'privacy_read_actual', 'privacy_read_unknown', 'privacy_read_equivalence', 'privacy_list',
  'isolation_compare', 'owner_unchanged',
] as const;
export type HostedMediaStagingStep = typeof HOSTED_MEDIA_STAGING_STEPS[number];

export class HostedCheckFailure extends Error {
  constructor(readonly checkId: HostedCheckId, readonly mediaStep?: HostedMediaStagingStep) {
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
  try {
    passed = await operation();
  } catch (error) {
    mediaStep = hostedMediaStepFromError(error);
    passed = false;
  }
  if (!passed) throw new HostedCheckFailure(checkId, checkId === 'media_staging' ? mediaStep : undefined);
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
