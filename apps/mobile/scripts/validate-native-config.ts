import {
  runExpoConfig,
  validateNativeConfigWithRunner,
} from './native-config-command';

const codes = validateNativeConfigWithRunner(runExpoConfig);

if (codes.length === 0) {
  process.stdout.write('native_config_policy_ok\n');
} else {
  process.stderr.write(`${codes.join('\n')}\n`);
  process.exitCode = 1;
}
