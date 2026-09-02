import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDocument } from 'yaml';

const workflowUrl = new URL('../.github/workflows/ios-device-lab.yml', import.meta.url);
const sha = {
  checkout: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  node: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  pnpm: 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
  ruby: 'ruby/setup-ruby@95ef2b042f9d7a56d8268cba8559e2842e2ad01b',
  upload: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  attest: 'actions/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a',
};
const fixedInputs = {
  GOOGLE_MAPS_IOS_API_KEY: 'compile-probe-google-maps-ios-key',
  EXPO_PUBLIC_SUPABASE_URL: 'https://compile-probe.invalid',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'compile-probe-supabase-public-key',
};
const candidateSecrets = {
  GOOGLE_MAPS_IOS_API_KEY: '${{ secrets.GOOGLE_MAPS_IOS_API_KEY }}',
  EXPO_PUBLIC_SUPABASE_URL: '${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: '${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}',
};
const actionWith = {
  pnpm: { version: '11.19.0' },
  node: { 'node-version': '22.23.1', cache: 'pnpm' },
  ruby: { 'ruby-version': '3.3.12', bundler: 'none' },
};
const nativeUses = [sha.checkout, sha.pnpm, sha.node, sha.ruby];
const toolCheck = `sudo xcode-select -s /Applications/Xcode_26.4.1.app/Contents/Developer
test "$(xcodebuild -version | sed -n '1p')" = 'Xcode 26.4.1'
test "$(xcodebuild -version | sed -n '2p')" = 'Build version 17E202'
test "$(node --version)" = 'v22.23.1'
test "$(pnpm --version)" = '11.19.0'
test "$(ruby --version | awk '{print $2}')" = '3.3.12'
pod _1.17.0_ --version
`;

async function parsedWorkflow() {
  const source = await readFile(workflowUrl, 'utf8');
  const document = parseDocument(source, { strict: true, uniqueKeys: true });
  assert.deepEqual(document.errors, [], `workflow YAML must parse: ${document.errors.join('; ')}`);
  return { source, workflow: document.toJS() };
}

function step(job, name) {
  const found = job.steps.find((candidate) => candidate.name === name);
  assert.ok(found, `missing ${name} step`);
  return found;
}

function uses(job) {
  return job.steps.filter((candidate) => candidate.uses).map((candidate) => candidate.uses);
}

function actionStep(job, action) {
  const found = job.steps.find((candidate) => candidate.uses === action);
  assert.ok(found, `missing ${action} action`);
  return found;
}

function assertStepOrder(job, expected, name) {
  assert.deepEqual(job.steps.map((candidate) => candidate.name ?? candidate.uses), expected, `${name} steps`);
}

function assertOnlyStepEnvs(job, allowed, name) {
  for (const candidate of job.steps) {
    assert.deepEqual(candidate.env, allowed.get(candidate.name), `${name} env on ${candidate.name ?? candidate.uses}`);
  }
}

function assertNativeJob(job, name, expectedUses = nativeUses) {
  assert.equal(job['runs-on'], 'macos-26', `${name} runner`);
  assert.equal(job['timeout-minutes'], 45, `${name} timeout`);
  assert.deepEqual(uses(job), expectedUses, `${name} action sites`);
  assert.deepEqual(actionStep(job, sha.pnpm).with, actionWith.pnpm, `${name} pnpm setup inputs`);
  assert.deepEqual(actionStep(job, sha.node).with, actionWith.node, `${name} Node setup inputs`);
  assert.deepEqual(actionStep(job, sha.ruby).with, actionWith.ruby, `${name} Ruby setup inputs`);
  assert.deepEqual(step(job, 'Verify the pinned native toolchain').run, toolCheck, `${name} tool verification`);
  assert.deepEqual(step(job, 'Install workspace dependencies').run, 'pnpm install --frozen-lockfile');
  assert.deepEqual(step(job, 'Validate repository policy contracts').run, [
    'pnpm validate:pilot-policies',
    'pnpm test:root-contracts',
    'pnpm test:ios-device-lab-policy',
    '',
  ].join('\n'));
}

function assertCleanup(job, name, cleanupName, run) {
  const cleanup = step(job, cleanupName);
  assert.equal(cleanup.if, 'always()', `${name} cleanup must always run`);
  assert.equal(cleanup.run, run, `${name} cleanup paths`);
}

function assertWorkflowContract(workflow, source) {
  assert.deepEqual(Object.keys(workflow), ['name', 'on', 'permissions', 'jobs']);
  assert.equal(workflow.name, 'iOS Device Lab');
  assert.deepEqual(workflow.on, { pull_request: null, workflow_dispatch: null });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.doesNotMatch(source, /hashFiles\s*\(/, 'hashFiles is not valid in job-level if expressions');

  const jobs = workflow.jobs;
  assert.deepEqual(Object.keys(jobs), ['preflight', 'lock_bootstrap', 'pr_compile', 'device_candidate']);
  const { preflight, lock_bootstrap: bootstrap, pr_compile: compile, device_candidate: candidate } = jobs;

  assert.deepEqual(Object.keys(preflight), ['runs-on', 'timeout-minutes', 'permissions', 'outputs', 'steps']);
  assert.equal(preflight['runs-on'], 'ubuntu-latest');
  assert.equal(preflight['timeout-minutes'], 5);
  assert.deepEqual(preflight.permissions, { contents: 'read' });
  assert.deepEqual(preflight.outputs, {
    lock_present: '${{ steps.state.outputs.lock_present }}',
    readiness_present: '${{ steps.state.outputs.readiness_present }}',
  });
  assert.deepEqual(uses(preflight), [sha.checkout]);
  assertStepOrder(preflight, [sha.checkout, 'Read reviewed prerequisite presence'], 'preflight');
  assert.equal(step(preflight, 'Read reviewed prerequisite presence').id, 'state');
  assertOnlyStepEnvs(preflight, new Map(), 'preflight');
  assert.equal('env' in preflight, false);
  assert.equal('environment' in preflight, false);

  assert.deepEqual(bootstrap.permissions, { contents: 'read' });
  assert.equal(bootstrap.if, "${{ github.event_name == 'pull_request' && needs.preflight.outputs.lock_present == 'false' }}");
  assert.deepEqual(bootstrap.needs, ['preflight']);
  assertNativeJob(bootstrap, 'lock bootstrap', [...nativeUses, sha.upload]);
  assertStepOrder(bootstrap, [
    sha.checkout, sha.pnpm, sha.node, sha.ruby,
    'Install workspace dependencies', 'Verify the pinned native toolchain',
    'Validate repository policy contracts', 'Generate the missing Pod lock inputs',
    'Prepare the generated Podfile for locked installation', 'Resolve the missing Pod lock only',
    'Upload the generated Pod lock for review', 'Remove generated native files',
  ], 'lock bootstrap');
  assert.equal('environment' in bootstrap, false);
  assert.equal('env' in bootstrap, false);
  const bootstrapGenerate = step(bootstrap, 'Generate the missing Pod lock inputs');
  assert.deepEqual(bootstrapGenerate.env, fixedInputs);
  assertOnlyStepEnvs(bootstrap, new Map([['Generate the missing Pod lock inputs', fixedInputs]]), 'lock bootstrap');
  assert.equal(bootstrapGenerate['working-directory'], 'apps/mobile');
  assert.equal(bootstrapGenerate.run, 'pnpm exec expo prebuild --clean --platform ios --no-install');
  const bootstrapPrepare = step(bootstrap, 'Prepare the generated Podfile for locked installation');
  assert.equal(bootstrapPrepare['working-directory'], 'apps/mobile');
  assert.equal(bootstrapPrepare.run, 'pnpm exec tsx scripts/prepare-ios-device-lab-podfile.ts ios/Podfile ios/Podfile.properties.json');
  const bootstrapResolve = step(bootstrap, 'Resolve the missing Pod lock only');
  assert.equal(bootstrapResolve['working-directory'], 'apps/mobile');
  assert.equal(bootstrapResolve.run, 'cd ios\npod _1.17.0_ install\n');
  const bootstrapUpload = step(bootstrap, 'Upload the generated Pod lock for review');
  assert.deepEqual(bootstrapUpload.with, {
    name: 'ios-device-lab-podfile-lock',
    path: 'apps/mobile/ios/Podfile.lock',
    'if-no-files-found': 'error',
    'retention-days': 3,
  });
  assert.equal(bootstrap.steps.filter((candidate) => candidate.uses === sha.upload).length, 1);
  assertCleanup(bootstrap, 'lock bootstrap', 'Remove generated native files', 'rm -rf -- apps/mobile/ios');
  assert.doesNotMatch(JSON.stringify(bootstrap), /build:unsigned-ios|attest|device_candidate/);

  assert.deepEqual(compile.permissions, { contents: 'read' });
  assert.equal(compile.if, "${{ github.event_name == 'pull_request' && needs.preflight.outputs.lock_present == 'true' }}");
  assert.deepEqual(compile.needs, ['preflight']);
  assertNativeJob(compile, 'PR compile');
  assertStepOrder(compile, [
    sha.checkout, sha.pnpm, sha.node, sha.ruby,
    'Install workspace dependencies', 'Verify the pinned native toolchain',
    'Validate repository policy contracts', 'Validate and build the non-installable compile probe',
    'Remove non-installable compile outputs',
  ], 'PR compile');
  assert.equal('environment' in compile, false);
  assert.equal('env' in compile, false);
  assert.equal(compile.steps.some((candidate) => candidate.uses === sha.upload || candidate.uses === sha.attest), false);
  const compileBuild = step(compile, 'Validate and build the non-installable compile probe');
  assert.deepEqual(compileBuild.env, fixedInputs);
  assertOnlyStepEnvs(compile, new Map([['Validate and build the non-installable compile probe', fixedInputs]]), 'PR compile');
  assert.match(compileBuild.run, /pnpm validate:ios-device-lab/);
  assert.match(compileBuild.run, /pnpm --filter @animalhelper\/mobile build:unsigned-ios/);
  assert.equal(compile.steps.some((candidate) => candidate.env && JSON.stringify(candidate.env).includes('secrets.')), false);
  assertCleanup(compile, 'PR compile', 'Remove non-installable compile outputs', [
    'rm -rf -- apps/mobile/ios',
    'rm -rf -- apps/mobile/.ios-device-lab-staging',
    'rm -rf -- apps/mobile/.ios-device-lab-derived-data',
    'rm -rf -- apps/mobile/ios-device-lab-artifacts',
    '',
  ].join('\n'));

  assert.deepEqual(candidate.permissions, { contents: 'read', 'id-token': 'write', attestations: 'write' });
  assert.equal(candidate.if, "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && needs.preflight.outputs.lock_present == 'true' && needs.preflight.outputs.readiness_present == 'true' }}");
  assert.deepEqual(candidate.needs, ['preflight']);
  assert.equal(candidate.environment, 'ios-device-lab');
  assertNativeJob(candidate, 'device candidate', [...nativeUses, sha.attest, sha.upload]);
  assertStepOrder(candidate, [
    sha.checkout, 'Require the checked out immutable workflow commit', sha.pnpm, sha.node, sha.ruby,
    'Install workspace dependencies', 'Verify the pinned native toolchain',
    'Validate repository policy contracts', 'Validate the protected runtime inputs',
    'Validate Gate 2B readiness evidence', 'Validate the public key at the approved hosted origin',
    'Build the protected unsigned candidate', 'Attest the unsigned IPA provenance',
    'Upload the unsigned candidate allowlist', 'Remove generated candidate files',
  ], 'device candidate');
  assert.deepEqual(candidate.steps[0].with, { ref: '${{ github.sha }}', 'fetch-depth': 0 });
  assert.equal(step(candidate, 'Require the checked out immutable workflow commit').run, 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
  assert.match(step(candidate, 'Validate Gate 2B readiness evidence').run, /evaluateGate2BReadiness/);
  assert.match(step(candidate, 'Validate Gate 2B readiness evidence').run, /merge-base', '--is-ancestor/);
  const allowedSecretSteps = new Map([
    ['Validate the protected runtime inputs', candidateSecrets],
    ['Validate the public key at the approved hosted origin', {
      EXPO_PUBLIC_SUPABASE_URL: candidateSecrets.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: candidateSecrets.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    }],
    ['Build the protected unsigned candidate', candidateSecrets],
  ]);
  assert.equal('env' in candidate, false);
  assertOnlyStepEnvs(candidate, allowedSecretSteps, 'device candidate');
  const candidateUpload = step(candidate, 'Upload the unsigned candidate allowlist');
  assert.deepEqual(candidateUpload.with, {
    name: 'whiskercommons-unsigned-${{ github.sha }}',
    path: [
      'apps/mobile/ios-device-lab-artifacts/*.ipa',
      'apps/mobile/ios-device-lab-artifacts/*.manifest.json',
      'apps/mobile/ios-device-lab-artifacts/*.sha256',
      '',
    ].join('\n'),
    'if-no-files-found': 'error',
    'retention-days': 7,
  });
  assert.deepEqual(step(candidate, 'Attest the unsigned IPA provenance').with, {
    'subject-path': 'apps/mobile/ios-device-lab-artifacts/*.ipa',
  });
  assert.equal(candidate.steps.filter((candidateStep) => candidateStep.uses === sha.upload).length, 1);
  assertCleanup(candidate, 'device candidate', 'Remove generated candidate files', [
    'rm -rf -- apps/mobile/ios',
    'rm -rf -- apps/mobile/.ios-device-lab-staging',
    'rm -rf -- apps/mobile/.ios-device-lab-derived-data',
    'rm -rf -- apps/mobile/ios-device-lab-artifacts',
    '',
  ].join('\n'));
}

test('workflow parses structurally and enforces the complete least-privilege contract', async () => {
  const { source, workflow } = await parsedWorkflow();
  assertWorkflowContract(workflow, source);
});

test('contract rejects job, permission, environment, cleanup, setup, upload-path, and checkout mutations', async () => {
  const { source, workflow } = await parsedWorkflow();
  const mutations = [
    ['extra job', (candidate) => { candidate.jobs.unreviewed = {}; }],
    ['workflow write permission', (candidate) => { candidate.permissions.contents = 'write'; }],
    ['preflight job env', (candidate) => { candidate.jobs.preflight.env = candidateSecrets; }],
    ['bootstrap job secret env', (candidate) => { candidate.jobs.lock_bootstrap.env = candidateSecrets; }],
    ['PR job secret env', (candidate) => { candidate.jobs.pr_compile.env = candidateSecrets; }],
    ['candidate job env', (candidate) => { candidate.jobs.device_candidate.env = candidateSecrets; }],
    ['PR secret', (candidate) => { step(candidate.jobs.pr_compile, 'Install workspace dependencies').env = candidateSecrets; }],
    ['cleanup skipped after failure', (candidate) => { step(candidate.jobs.pr_compile, 'Remove non-installable compile outputs').if = 'success()'; }],
    ['cleanup outside the allowlist', (candidate) => { step(candidate.jobs.device_candidate, 'Remove generated candidate files').run += '\nrm -rf -- /tmp/unsafe'; }],
    ['pnpm version drift', (candidate) => { actionStep(candidate.jobs.lock_bootstrap, sha.pnpm).with.version = '11.20.0'; }],
    ['Node cache drift', (candidate) => { actionStep(candidate.jobs.pr_compile, sha.node).with.cache = 'npm'; }],
    ['Ruby bundler drift', (candidate) => { actionStep(candidate.jobs.device_candidate, sha.ruby).with.bundler = 'default'; }],
    ['extra candidate upload path', (candidate) => { step(candidate.jobs.device_candidate, 'Upload the unsigned candidate allowlist').with.path += '\napps/mobile/ios-device-lab-artifacts/*.zip'; }],
    ['shallow candidate checkout', (candidate) => { candidate.jobs.device_candidate.steps[0].with['fetch-depth'] = 1; }],
  ];

  for (const [name, mutate] of mutations) {
    const candidate = structuredClone(workflow);
    mutate(candidate);
    assert.throws(() => assertWorkflowContract(candidate, source), undefined, name);
  }
});
