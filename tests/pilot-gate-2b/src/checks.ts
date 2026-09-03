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

export type HostedCheckAdapter = Readonly<{
  verifyAuthRedirects(configuration: typeof AUTH_CONFIGURATION): Promise<boolean>;
  verifyMediaStaging(configuration: typeof STAGING_CONFIGURATION): Promise<boolean>;
  verifyPublicKeyOrigin(origin: string): Promise<boolean>;
  runOwnerHappyPath(): Promise<boolean>;
  verifyCrossOwnerIsolation(): Promise<boolean>;
}>;

async function requirePassed(operation: () => Promise<boolean>): Promise<void> {
  let passed = false;
  try {
    passed = await operation();
  } catch {
    passed = false;
  }
  if (!passed) throw new Error('hosted_checks_failed');
}

export async function runHostedChecks(
  env: HostedGateEnvironment,
  adapter: HostedCheckAdapter,
): Promise<ReadinessChecks> {
  await requirePassed(() => adapter.verifyAuthRedirects(AUTH_CONFIGURATION));
  await requirePassed(() => adapter.verifyMediaStaging(STAGING_CONFIGURATION));
  await requirePassed(() => adapter.verifyPublicKeyOrigin(env.apiUrl));
  await requirePassed(() => adapter.runOwnerHappyPath());
  await requirePassed(() => adapter.verifyCrossOwnerIsolation());
  return {
    authRedirectCheck: 'passed',
    mediaStagingCheck: 'passed',
    publicKeyOriginCheck: 'passed',
    syntheticOwnerHappyPath: 'passed',
    crossOwnerIsolation: 'passed',
  };
}
