import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDocument } from 'yaml';

const workflowUrl = new URL('../.github/workflows/hosted-gate-2b.yml', import.meta.url);
const SHAS = {
  checkout: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  pnpm: 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
  node: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  deno: 'denoland/setup-deno@e95548e56dfa95d4e1a28d6f422fafe75c4c26fb',
  supabase: 'supabase/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf',
  upload: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  download: 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  attest: 'actions/attest-build-provenance@43d14bc2b83dec42d39ecae14e916627a18bb661',
};
const paths = [
  '.github/workflows/hosted-gate-2b.yml', 'scripts/**', 'tests/pilot-gate-2a/**',
  'tests/pilot-gate-2b/**', 'supabase/config.toml', 'supabase/migrations/**',
  'supabase/functions/**', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
];

async function workflow() {
  const source = await readFile(workflowUrl, 'utf8');
  const document = parseDocument(source, { strict: true, uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  return { source, value: document.toJS() };
}

function assertContract(source, value) {
  assert.equal(value.name, 'Hosted Gate 2B');
  assert.deepEqual(value.on, {
    push: { branches: ['codex/hosted-gate-2b'], paths }, workflow_dispatch: null,
  });
  assert.deepEqual(value.permissions, { contents: 'read' });
  assert.deepEqual(value.concurrency, {
    group: 'hosted-gate-2b-${{ github.repository }}-fhugdtpjbgiatqhvjioy',
    'cancel-in-progress': false,
  });
  assert.deepEqual(Object.keys(value.jobs), ['hosted_gate_2b', 'attest_evidence']);
  const producer = value.jobs.hosted_gate_2b;
  assert.equal(producer.environment, 'hosted-gate-2b');
  assert.equal(producer['runs-on'], 'ubuntu-latest');
  assert.equal(producer['timeout-minutes'], 20);
  assert.deepEqual(producer.permissions, { contents: 'read' });
  assert.equal('env' in producer, false);
  assert.deepEqual(producer.steps.filter((step) => step.uses).map((step) => step.uses), [
    SHAS.checkout, SHAS.pnpm, SHAS.node, SHAS.deno, SHAS.supabase, SHAS.upload, SHAS.upload,
  ]);
  assert.deepEqual(producer.steps[0].with, { ref: '${{ github.sha }}', 'fetch-depth': 0, 'persist-credentials': false });
  const run = producer.steps.find((step) => step.name === 'Run protected Hosted Gate 2B');
  assert.deepEqual(Object.keys(run.env).sort(), [
    'GITHUB_ENVIRONMENT', 'PRECISE_LOCATION_ENCRYPTION_KEY', 'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DATABASE_URL', 'SUPABASE_PUBLIC_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TMPDIR',
  ]);
  assert.equal(run.run, 'pnpm pilot-gate-2b');
  assert.equal(run['timeout-minutes'], 15);
  const hostedCleanup = producer.steps.find((step) => step.name === 'Recover exact hosted fixtures');
  assert.equal(hostedCleanup.if, 'always()');
  assert.equal(hostedCleanup['timeout-minutes'], 3);
  assert.equal(hostedCleanup.run, 'pnpm --filter @animalhelper/pilot-gate-2b cleanup:hosted');
  assert.deepEqual(Object.keys(hostedCleanup.env).sort(), [
    'GITHUB_RUN_ATTEMPT', 'GITHUB_RUN_ID', 'GITHUB_SHA', 'PILOT_GATE_2B_LEDGER_PATH',
    'PRECISE_LOCATION_ENCRYPTION_KEY', 'SUPABASE_DATABASE_URL', 'SUPABASE_PUBLIC_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL',
  ]);
  const localCleanup = producer.steps.at(-1);
  assert.equal(localCleanup.if, 'always()');
  assert.deepEqual(localCleanup.run, [
    'pnpm pilot-gate-2b:cleanup-diagnostic',
    'rm -f -- docs/evidence/pilot-gate-2b-readiness.json',
    '',
  ].join('\n'));
  const successUpload = producer.steps.find((step) => step.name === 'Upload canonical readiness evidence');
  assert.deepEqual(successUpload.with, {
    name: 'pilot-gate-2b-readiness-${{ github.run_id }}-${{ github.run_attempt }}',
    path: 'docs/evidence/pilot-gate-2b-readiness.json', 'if-no-files-found': 'error', 'retention-days': 3,
  });
  const failureUpload = producer.steps.find((step) => step.name === 'Upload sanitized failure diagnostic');
  assert.equal(failureUpload.if, "failure() && steps.gate.outcome == 'failure'");
  assert.equal(failureUpload.with.path, '${{ runner.temp }}/animalhelper-pilot-gate-2b-failure.log');
  assert.equal(JSON.stringify(producer).includes('ios-device-lab'), false);
  assert.equal(JSON.stringify(producer).includes('contents":"write'), false);

  const attest = value.jobs.attest_evidence;
  assert.equal(attest.needs, 'hosted_gate_2b');
  assert.equal('environment' in attest, false);
  assert.deepEqual(attest.permissions, { contents: 'read', 'id-token': 'write', attestations: 'write' });
  assert.deepEqual(attest.steps.map((step) => step.uses), [SHAS.download, SHAS.attest]);
  assert.equal(attest.steps[1].with['subject-path'], 'evidence/pilot-gate-2b-readiness.json');
  assert.doesNotMatch(source, /@(v|main|master)(?:\s|\n)/);
  assert.doesNotMatch(source, /contents:\s*write/);
}

test('protects the hosted producer and separates it from the device environment', async () => {
  const { source, value } = await workflow();
  assertContract(source, value);
});

test('contract rejects environment, permissions, secret scope, action, and cleanup drift', async () => {
  const { source, value } = await workflow();
  const mutations = [
    (item) => { item.jobs.hosted_gate_2b.environment = 'ios-device-lab'; },
    (item) => { item.jobs.hosted_gate_2b.permissions.contents = 'write'; },
    (item) => { item.jobs.hosted_gate_2b.env = { SUPABASE_ACCESS_TOKEN: 'secret' }; },
    (item) => { item.jobs.hosted_gate_2b.steps[0].uses = 'actions/checkout@v4'; },
    (item) => { item.jobs.hosted_gate_2b.steps.find((step) => step.name === 'Recover exact hosted fixtures').if = 'success()'; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(value); mutate(candidate);
    assert.throws(() => assertContract(source, candidate));
  }
});
