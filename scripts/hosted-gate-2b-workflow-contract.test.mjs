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

async function workflow() {
  const source = await readFile(workflowUrl, 'utf8');
  const document = parseDocument(source, { strict: true, uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  return { source, value: document.toJS() };
}

function step(job, name) {
  return job.steps.find((item) => item.name === name);
}

function assertContract(source, value) {
  assert.equal(value.name, 'Hosted Gate 2B');
  assert.deepEqual(value.on.workflow_dispatch.inputs, {
    mode: {
      description: 'Run the correctness gate or the isolated latency characterization.',
      required: true, default: 'correctness', type: 'choice', options: ['correctness', 'characterize'],
    },
  });
  assert.equal(source.includes('relaxed_finalize_timeout'), false);
  assert.deepEqual(value.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(value.jobs), ['hosted_gate_2b', 'attest_evidence']);

  const producer = value.jobs.hosted_gate_2b;
  assert.equal(producer.environment, 'hosted-gate-2b');
  assert.equal(producer['timeout-minutes'], 30);
  assert.deepEqual(producer.permissions, { contents: 'read' });
  assert.equal('env' in producer, false);
  assert.deepEqual(producer.steps.filter((item) => item.uses).map((item) => item.uses), [
    SHAS.checkout, SHAS.pnpm, SHAS.node, SHAS.deno, SHAS.supabase,
    SHAS.upload, SHAS.upload, SHAS.upload,
  ]);

  const correctness = step(producer, 'Run protected Hosted Gate 2B correctness');
  assert.equal(correctness.id, 'correctness');
  assert.equal(correctness.if, "github.event_name == 'push' || inputs.mode == 'correctness'");
  assert.equal(correctness.run, 'pnpm pilot-gate-2b');
  assert.equal(correctness.env.PILOT_GATE_2B_MODE, 'correctness');
  assert.equal(correctness.env.PILOT_GATE_2B_FINALIZE_TIMEOUT_MS, '15000');
  const characterize = step(producer, 'Characterize Hosted Gate 2B latency');
  assert.equal(characterize.id, 'characterize');
  assert.equal(characterize.if, "github.event_name == 'workflow_dispatch' && inputs.mode == 'characterize'");
  assert.equal(characterize.run, 'pnpm pilot-gate-2b');
  assert.equal(characterize.env.PILOT_GATE_2B_MODE, 'characterize');
  assert.equal(characterize.env.PILOT_GATE_2B_FINALIZE_TIMEOUT_MS, '30000');

  const cleanup = step(producer, 'Recover exact hosted fixtures');
  assert.equal(cleanup.id, 'cleanup');
  assert.equal(cleanup.if, 'always()');
  assert.equal(cleanup['timeout-minutes'], 3);
  assert.equal(cleanup.run, 'pnpm --filter @animalhelper/pilot-gate-2b cleanup:hosted');
  assert.match(cleanup.env.PILOT_GATE_2B_LEDGER_PATH,
    /animalhelper-pilot-gate-2b-ledger-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\.json$/);
  assert.match(cleanup.env.PILOT_GATE_2B_CHECKS_PATH, /hosted-gate-2b-checks\.json$/);
  assert.match(cleanup.env.PILOT_GATE_2B_CLEANUP_PATH, /hosted-gate-2b-cleanup\.json$/);
  assert.equal(cleanup.env.PILOT_GATE_2B_MODE,
    "${{ github.event_name == 'workflow_dispatch' && inputs.mode || 'correctness' }}");

  const evidence = step(producer, 'Write canonical readiness evidence');
  const correctnessCondition = "steps.correctness.outcome == 'success' && steps.cleanup.outcome == 'success'";
  assert.equal(evidence.if, correctnessCondition);
  assert.equal(evidence.run, 'pnpm --filter @animalhelper/pilot-gate-2b evidence:write');
  assert.equal(evidence.env.PILOT_GATE_2B_MODE, 'correctness');
  assert.match(evidence.env.PILOT_GATE_2B_CHECKS_PATH, /hosted-gate-2b-checks\.json$/);
  assert.match(evidence.env.PILOT_GATE_2B_CLEANUP_PATH, /hosted-gate-2b-cleanup\.json$/);

  const readinessUpload = step(producer, 'Upload canonical readiness evidence');
  assert.equal(readinessUpload.if, correctnessCondition);
  assert.equal(readinessUpload.with['retention-days'], 3);
  const performanceUpload = step(producer, 'Upload latency characterization');
  assert.equal(performanceUpload.if,
    "steps.characterize.outcome == 'success' && steps.cleanup.outcome == 'success'");
  assert.match(performanceUpload.with.path, /hosted-gate-2b-performance\.json$/);
  assert.equal(performanceUpload.with['retention-days'], 3);
  assert.equal(step(producer, 'Upload sanitized failure diagnostic').if,
    "failure() && (steps.correctness.outcome == 'failure' || steps.characterize.outcome == 'failure')");

  const localCleanup = step(producer, 'Remove runner-local Gate 2B outputs');
  assert.equal(localCleanup.if, 'always()');
  assert.match(localCleanup.run, /pilot-gate-2b:cleanup-diagnostic/);
  assert.match(localCleanup.run, /pilot-gate-2b-readiness\.json/);

  const attest = value.jobs.attest_evidence;
  assert.equal(attest.needs, 'hosted_gate_2b');
  assert.equal(attest.if, "github.event_name == 'push' || inputs.mode == 'correctness'");
  assert.deepEqual(attest.permissions, { contents: 'read', 'id-token': 'write', attestations: 'write' });
  assert.deepEqual(attest.steps.map((item) => item.uses), [SHAS.download, SHAS.attest]);
  assert.equal(attest.steps[1].with['subject-path'], 'evidence/pilot-gate-2b-readiness.json');
  assert.doesNotMatch(source, /@(v|main|master)(?:\s|\n)/);
  assert.doesNotMatch(source, /contents:\s*write/);
  assert.equal(JSON.stringify(producer).includes('ios-device-lab'), false);
}

test('separates correctness, cleanup proof, evidence, and characterization', async () => {
  const { source, value } = await workflow();
  assertContract(source, value);
});

test('rejects mode, secret scope, cleanup, evidence, and action drift', async () => {
  const { source, value } = await workflow();
  const mutations = [
    (item) => { item.jobs.hosted_gate_2b.environment = 'ios-device-lab'; },
    (item) => { item.jobs.hosted_gate_2b.env = { SUPABASE_ACCESS_TOKEN: 'secret' }; },
    (item) => { item.on.workflow_dispatch.inputs.mode.options.push('relaxed'); },
    (item) => { step(item.jobs.hosted_gate_2b, 'Run protected Hosted Gate 2B correctness').env.PILOT_GATE_2B_FINALIZE_TIMEOUT_MS = '30000'; },
    (item) => { step(item.jobs.hosted_gate_2b, 'Recover exact hosted fixtures').if = 'success()'; },
    (item) => { step(item.jobs.hosted_gate_2b, 'Write canonical readiness evidence').if = 'success()'; },
    (item) => { step(item.jobs.hosted_gate_2b, 'Upload latency characterization').if = 'always()'; },
    (item) => { item.jobs.hosted_gate_2b.steps[0].uses = 'actions/checkout@v4'; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(value);
    mutate(candidate);
    assert.throws(() => assertContract(source, candidate));
  }
});
