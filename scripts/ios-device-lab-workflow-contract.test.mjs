import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/ios-device-lab.yml', import.meta.url);

const actionShas = {
  'actions/checkout': '11d5960a326750d5838078e36cf38b85af677262',
  'actions/setup-node': '49933ea5288caeca8642d1e84afbd3f7d6820020',
  'pnpm/action-setup': 'b906affcce14559ad1aafd4ab0e942779e9f58b1',
  'ruby/setup-ruby': '95ef2b042f9d7a56d8268cba8559e2842e2ad01b',
  'actions/upload-artifact': 'ea165f8d65b6e75b540449e92b4886f43607fa02',
  'actions/attest-build-provenance': '977bb373ede98d70efdf65b84cb5f73e068dcc2a',
};

async function workflowText() {
  try {
    return await readFile(workflowUrl, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    throw error;
  }
}

function jobBlock(workflow, jobName) {
  const start = workflow.indexOf(`  ${jobName}:\n`);
  assert.notEqual(start, -1, `workflow must declare the ${jobName} job`);
  const remaining = workflow.slice(start);
  const nextJob = remaining.slice(1).search(/\n  [a-z_]+:\n/);
  return nextJob === -1 ? remaining : remaining.slice(0, nextJob + 1);
}

test('iOS Device Lab workflow has only the intended entry points and baseline token', async () => {
  const workflow = await workflowText();

  assert.match(workflow, /^name: iOS Device Lab$/m);
  assert.match(workflow, /^on:\n  pull_request:\n  workflow_dispatch:$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  const rootPermissions = /^permissions:\n([\s\S]*?)^jobs:/m.exec(workflow);
  assert.ok(rootPermissions, 'workflow must have a root permission map before jobs');
  assert.equal(rootPermissions[1].trim(), 'contents: read');
  assert.match(workflow, /^jobs:\n/m);
});

test('iOS Device Lab pins every action and its macOS toolchain exactly', async () => {
  const workflow = await workflowText();
  const uses = [...workflow.matchAll(/^\s*(?:- )?uses: ([^\s]+)$/gm)].map((match) => match[1]);

  assert.ok(uses.length > 0, 'workflow must use only reviewed full-SHA actions');
  for (const use of uses) {
    assert.match(use, /^[^@]+@[a-f0-9]{40}$/, `${use} must be a full commit SHA`);
  }
  for (const [action, sha] of Object.entries(actionShas)) {
    assert.ok(uses.includes(`${action}@${sha}`), `workflow must use the reviewed ${action} SHA`);
  }
  assert.match(workflow, /runs-on: macos-26/g);
  assert.match(workflow, /timeout-minutes: 45/g);
  assert.match(workflow, /version: 11\.19\.0/);
  assert.match(workflow, /node-version: 22\.23\.1/);
  assert.match(workflow, /ruby-version: 3\.3\.12/);
  assert.match(workflow, /Xcode 26\.4\.1/);
  assert.match(workflow, /Build version 17E202/);
  assert.match(workflow, /pod _1\.17\.0_ --version/);
});

test('lock bootstrap is PR-only, lock-only, short-lived, and never a candidate', async () => {
  const workflow = await workflowText();
  const bootstrap = jobBlock(workflow, 'lock_bootstrap');

  assert.match(bootstrap, /github\.event_name == 'pull_request'/);
  assert.match(bootstrap, /hashFiles\('apps\/mobile\/ios-device-lab\/Podfile\.lock'\) == ''/);
  assert.match(bootstrap, /permissions:\n      contents: read/);
  assert.doesNotMatch(bootstrap, /environment:/);
  assert.doesNotMatch(bootstrap, /secrets\./);
  assert.doesNotMatch(bootstrap, /id-token:|attestations:|attest-build-provenance|build:unsigned-ios|device_candidate/);
  assert.match(bootstrap, /expo prebuild --clean --platform ios --no-install/);
  assert.match(bootstrap, /pod _1\.17\.0_ install/);
  assert.match(bootstrap, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(bootstrap, /name: ios-device-lab-podfile-lock/);
  assert.match(bootstrap, /path: apps\/mobile\/ios\/Podfile\.lock/);
  assert.match(bootstrap, /retention-days: 3/);
  assert.match(bootstrap, /if: always\(\)/);
  assert.match(bootstrap, /rm -rf -- apps\/mobile\/ios/);
});

test('PR compile is placeholder-only and cannot upload, attest, or receive privileged context', async () => {
  const workflow = await workflowText();
  const compile = jobBlock(workflow, 'pr_compile');

  assert.match(compile, /github\.event_name == 'pull_request'/);
  assert.match(compile, /hashFiles\('apps\/mobile\/ios-device-lab\/Podfile\.lock'\) != ''/);
  assert.match(compile, /permissions:\n      contents: read/);
  assert.match(compile, /GOOGLE_MAPS_IOS_API_KEY: compile-probe-google-maps-ios-key/);
  assert.match(compile, /EXPO_PUBLIC_SUPABASE_URL: https:\/\/compile-probe\.invalid/);
  assert.match(compile, /EXPO_PUBLIC_SUPABASE_ANON_KEY: compile-probe-supabase-public-key/);
  assert.match(compile, /pnpm validate:ios-device-lab/);
  assert.match(compile, /pnpm --filter @animalhelper\/mobile build:unsigned-ios/);
  assert.doesNotMatch(compile, /environment:|secrets\.|id-token:|attestations:|upload-artifact|attest-build-provenance/);
  assert.match(compile, /if: always\(\)/);
  assert.match(compile, /rm -rf -- apps\/mobile\/ios-device-lab-artifacts/);
});

test('manual candidate has the protected narrow permission map and step-scoped runtime inputs', async () => {
  const workflow = await workflowText();
  const candidate = jobBlock(workflow, 'device_candidate');

  assert.match(candidate, /github\.event_name == 'workflow_dispatch'/);
  assert.match(candidate, /github\.ref == 'refs\/heads\/main'/);
  assert.match(candidate, /hashFiles\('apps\/mobile\/ios-device-lab\/Podfile\.lock'\) != ''/);
  assert.match(candidate, /hashFiles\('docs\/evidence\/pilot-gate-2b-readiness\.json'\) != ''/);
  assert.match(candidate, /evaluateGate2BReadiness/);
  assert.match(candidate, /merge-base', '--is-ancestor/);
  assert.match(candidate, /environment: ios-device-lab/);
  assert.match(candidate, /permissions:\n      contents: read\n      id-token: write\n      attestations: write/);
  assert.doesNotMatch(candidate, /^    env:/m);
  assert.match(candidate, /GOOGLE_MAPS_IOS_API_KEY: \$\{\{ secrets\.GOOGLE_MAPS_IOS_API_KEY \}\}/);
  assert.match(candidate, /EXPO_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.EXPO_PUBLIC_SUPABASE_URL \}\}/);
  assert.match(candidate, /EXPO_PUBLIC_SUPABASE_ANON_KEY: \$\{\{ secrets\.EXPO_PUBLIC_SUPABASE_ANON_KEY \}\}/);
  assert.match(candidate, /pnpm validate:ios-device-lab/);
  assert.match(candidate, /git rev-parse HEAD/);
  assert.match(candidate, /\/auth\/v1\/settings/);
  assert.match(candidate, /pnpm --filter @animalhelper\/mobile build:unsigned-ios/);
  assert.match(candidate, /actions\/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a/);
  assert.match(candidate, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(candidate, /retention-days: 7/);
  assert.match(candidate, /\.ipa/);
  assert.match(candidate, /\.manifest\.json/);
  assert.match(candidate, /\.sha256/);
  assert.match(candidate, /if: always\(\)/);
  assert.match(candidate, /rm -rf -- apps\/mobile\/ios-device-lab-artifacts/);
});
