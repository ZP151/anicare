import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  evaluateNativeConfigEvidence,
  normalizeNativeConfigEvidence,
  type NativeConfigPolicyCode,
} from '../src/config/native-config-policy';

export type ExpoConfigKind = 'public' | 'introspect';
export type ExpoConfigRunner = (kind: ExpoConfigKind) => unknown;

const mobileRoot = resolve(__dirname, '..');

function nativeConfigJsonInvalid(): Error {
  return new Error('native_config_json_invalid');
}

export const runExpoConfig: ExpoConfigRunner = (kind) => {
  const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const suppressShellDeprecation = process.noDeprecation;
  if (process.platform === 'win32') {
    process.noDeprecation = true;
  }

  let result;
  try {
    result = spawnSync(
      pnpmExecutable,
      ['exec', 'expo', 'config', '--type', kind, '--json'],
      {
        cwd: mobileRoot,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        shell:
          process.platform === 'win32'
            ? (process.env.ComSpec ?? 'cmd.exe')
            : false,
      },
    );
  } finally {
    process.noDeprecation = suppressShellDeprecation;
  }

  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error('native_config_command_failed');
  }
  if (typeof result.stdout !== 'string') {
    throw nativeConfigJsonInvalid();
  }

  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw nativeConfigJsonInvalid();
  }
};

export function validateNativeConfigWithRunner(
  run: ExpoConfigRunner,
): readonly (
  | NativeConfigPolicyCode
  | 'native_config_command_failed'
  | 'native_config_json_invalid'
)[] {
  try {
    return evaluateNativeConfigEvidence(
      normalizeNativeConfigEvidence(run('public'), run('introspect')),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'native_config_json_invalid'
    ) {
      return ['native_config_json_invalid'];
    }
    return ['native_config_command_failed'];
  }
}
