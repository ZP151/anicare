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

function isExpoConfigKind(kind: unknown): kind is ExpoConfigKind {
  return kind === 'public' || kind === 'introspect';
}

export const runExpoConfig: ExpoConfigRunner = (kind) => {
  if (!isExpoConfigKind(kind)) {
    throw new Error('native_config_command_failed');
  }

  const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const expoConfigArguments = [
    'exec',
    'expo',
    'config',
    '--type',
    kind,
    '--json',
  ];
  const useWindowsCommand = process.platform === 'win32';
  const result = spawnSync(
    useWindowsCommand ? 'cmd.exe' : pnpmExecutable,
    useWindowsCommand
      ? ['/d', '/s', '/c', pnpmExecutable, ...expoConfigArguments]
      : expoConfigArguments,
    {
      cwd: mobileRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  );

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
