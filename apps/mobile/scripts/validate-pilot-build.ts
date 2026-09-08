import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  evaluatePilotBuildContract,
  type PilotBuildPolicyCode,
} from '../src/config/pilot-build-policy';

const mobileRoot = resolve(__dirname, '..');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasApprovedExpoProjectIdentity(appConfig: unknown): boolean {
  if (!isRecord(appConfig)) {
    return false;
  }
  const expo = appConfig.expo;
  if (!isRecord(expo) || expo.owner !== 'zhoupingdevs-team' || expo.slug !== 'anicare') {
    return false;
  }
  const extra = expo.extra;
  if (!isRecord(extra)) {
    return false;
  }
  const eas = extra.eas;
  return isRecord(eas) && eas.projectId === 'f9b84744-77c7-4b2b-8631-f107a8b98af8';
}

let codes: readonly PilotBuildPolicyCode[];
try {
  const easConfig = readJson(resolve(mobileRoot, 'eas.json'));
  const appConfig = readJson(resolve(mobileRoot, 'app.json'));
  const packageJson = readJson(resolve(mobileRoot, 'package.json'));
  const scripts =
    typeof packageJson === 'object' && packageJson !== null && !Array.isArray(packageJson)
      ? (packageJson as Readonly<Record<string, unknown>>).scripts
      : undefined;
  const pilotPolicyCodes = evaluatePilotBuildContract(easConfig, scripts);
  codes = hasApprovedExpoProjectIdentity(appConfig)
    ? pilotPolicyCodes
    : [...pilotPolicyCodes, 'eas_forbidden_configuration'];
} catch {
  codes = ['eas_forbidden_configuration'];
}

if (codes.length === 0) {
  process.stdout.write('pilot_build_policy_ok\n');
} else {
  process.stderr.write(`${codes.join('\n')}\n`);
  process.exitCode = 1;
}
