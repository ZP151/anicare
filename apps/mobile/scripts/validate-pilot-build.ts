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

let codes: readonly PilotBuildPolicyCode[];
try {
  const easConfig = readJson(resolve(mobileRoot, 'eas.json'));
  const packageJson = readJson(resolve(mobileRoot, 'package.json'));
  const scripts =
    typeof packageJson === 'object' && packageJson !== null && !Array.isArray(packageJson)
      ? (packageJson as Readonly<Record<string, unknown>>).scripts
      : undefined;
  codes = evaluatePilotBuildContract(easConfig, scripts);
} catch {
  codes = ['eas_forbidden_configuration'];
}

if (codes.length === 0) {
  process.stdout.write('pilot_build_policy_ok\n');
} else {
  process.stderr.write(`${codes.join('\n')}\n`);
  process.exitCode = 1;
}
