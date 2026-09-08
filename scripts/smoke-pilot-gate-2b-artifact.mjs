import { tmpdir } from 'node:os';
import { acquireVerifiedPilotGate2BArtifact } from './promote-pilot-gate-2b-evidence.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !/^[1-9][0-9]*$/.test(args[0]) ||
      !/^[1-9][0-9]*$/.test(args[1])) throw new Error('invalid_arguments');
  const acquired = await acquireVerifiedPilotGate2BArtifact({
    runId: Number(args[0]), runAttempt: Number(args[1]),
    temporaryRoot: tmpdir(), sourceDigest: args[2], sourceRef: args[3],
  });
  await acquired.cleanup();
  process.stdout.write('gate_2b_artifact_verified\n');
}

main().catch(() => {
  process.stderr.write('gate_2b_artifact_verification_failed\n');
  process.exitCode = 1;
});
