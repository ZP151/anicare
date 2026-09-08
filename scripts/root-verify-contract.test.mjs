import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJsonUrl = new URL('../package.json', import.meta.url);
const turboJsonUrl = new URL('../turbo.json', import.meta.url);
const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

test('root verification blocks on both native pilot policy validators', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));

  assert.equal(
    packageJson.scripts['validate:pilot-policies'],
    'pnpm --filter @animalhelper/mobile validate:native-config && pnpm --filter @animalhelper/mobile validate:pilot-build',
  );
  assert.match(
    packageJson.scripts.verify,
    /^pnpm validate:pilot-policies && /,
    'pilot policy validation must run before the general verification graph',
  );
  assert.equal(
    packageJson.scripts['test:ios-device-lab-workflow'],
    'node --test scripts/ios-device-lab-workflow-contract.test.mjs',
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm test:ios-device-lab-workflow/,
    'root verification must include the iOS Device Lab workflow contract',
  );
});

test('CI invokes the policy and contract gates independently before root verify', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const policyIndex = workflow.indexOf('- run: pnpm validate:pilot-policies');
  const contractIndex = workflow.indexOf('- run: pnpm test:root-contracts');
  const verifyIndex = workflow.indexOf('- run: pnpm verify');

  assert.ok(policyIndex >= 0, 'CI must invoke the native pilot policy gate directly');
  assert.ok(contractIndex > policyIndex, 'CI must invoke the root contract after policy validation');
  assert.ok(verifyIndex > contractIndex, 'both independent gates must run before root verification');
});

test('workspace type analysis builds dependency packages before clean-checkout resolution', async () => {
  const turbo = JSON.parse(await readFile(turboJsonUrl, 'utf8'));

  assert.ok(turbo.tasks.lint.dependsOn.includes('^build'));
  assert.ok(turbo.tasks.lint.dependsOn.includes('^lint'));
  assert.ok(turbo.tasks.typecheck.dependsOn.includes('^build'));
  assert.ok(turbo.tasks.typecheck.dependsOn.includes('^typecheck'));
});
