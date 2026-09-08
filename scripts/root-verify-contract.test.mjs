import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

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
  assert.match(
    packageJson.scripts['test:pilot-gate-2b-ci'],
    /scripts\/promote-pilot-gate-2b-evidence\.test\.mjs/,
    'the required Gate 2B aggregate must cover evidence promotion',
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm test:pilot-gate-2b-ci/,
    'root verification must include the full Gate 2B Node policy aggregate',
  );
  assert.equal(
    packageJson.scripts['test:hosted-gate-2b-workflow'],
    'node --test scripts/hosted-gate-2b-workflow-contract.test.mjs',
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm test:hosted-gate-2b-workflow/,
    'root verification must include the Hosted Gate 2B workflow contract',
  );
});

test('CI runs root verify once with required policy coverage and no duplicate preflight', async () => {
  const workflow = parse(await readFile(workflowUrl, 'utf8'));
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  for (const name of ['verify', 'database-contracts']) {
    const job = workflow.jobs[name];
    assert.equal(job.if, undefined, `${name} must not be conditional`);
    assert.ok([undefined, false].includes(job['continue-on-error']), `${name} must block on failure`);
  }
  const steps = workflow.jobs.verify.steps;
  const rootSteps = steps.filter((step) => step.run === 'pnpm verify');
  assert.equal(rootSteps.length, 1, 'CI must run the complete root verification exactly once');
  assert.equal(rootSteps[0].if, undefined, 'root verification must not be conditional');
  assert.ok([undefined, false].includes(rootSteps[0]['continue-on-error']), 'root verification must block on failure');
  const commands = packageJson.scripts.verify.split(' && ');
  for (const command of ['pnpm validate:pilot-policies', 'pnpm test:root-contracts', 'pnpm test:hosted-gate-2b-workflow']) {
    assert.equal(commands.filter((value) => value === command).length, 1, `${command} must remain covered by root verify`);
    assert.equal(steps.filter((step) => step.run === command).length, 0, `${command} must not also run as a duplicate CI step`);
  }
  const databaseStep = workflow.jobs['database-contracts'].steps.find((step) => step.run === 'pnpm pilot-gate-2a');
  assert.ok(databaseStep, 'the independent database integration gate must remain');
  assert.equal(databaseStep.if, undefined, 'database integration must not be skipped');
  assert.ok([undefined, false].includes(databaseStep['continue-on-error']), 'database integration must block on failure');
});

test('workspace type analysis builds dependency packages before clean-checkout resolution', async () => {
  const turbo = JSON.parse(await readFile(turboJsonUrl, 'utf8'));

  assert.ok(turbo.tasks.lint.dependsOn.includes('^build'));
  assert.ok(turbo.tasks.lint.dependsOn.includes('^lint'));
  assert.ok(turbo.tasks.typecheck.dependsOn.includes('^build'));
  assert.ok(turbo.tasks.typecheck.dependsOn.includes('^typecheck'));
});


test('root verify covers the CI source inventory contract once before lint', async () => {
  const pkg = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  assert.equal(pkg.scripts['test:pilot-source-inventory'], 'node --test scripts/pilot-gate-inputs.test.mjs');
  const commands = pkg.scripts.verify.split(' && ');
  assert.equal(commands.filter(command => command === 'pnpm test:pilot-source-inventory').length, 1);
  assert.ok(commands.indexOf('pnpm test:pilot-source-inventory') < commands.indexOf('pnpm lint'));
});
