import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDocument } from 'yaml';

const workflowUrl = new URL('../.github/workflows/community-media-cleanup.yml', import.meta.url);

async function workflow() {
  const source = await readFile(workflowUrl, 'utf8');
  const document = parseDocument(source, { strict: true, uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  return { source, value: document.toJS() };
}

function assertContract(source, value) {
  assert.equal(value.name, 'Community media cleanup');
  assert.equal(value.on.schedule, undefined);
  assert.equal(value.on.workflow_dispatch, null);
  assert.deepEqual(value.permissions, { contents: 'read' });
  assert.equal(value.concurrency.group, 'community-media-cleanup-${{ github.repository }}');
  assert.equal(value.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(value.jobs), ['cleanup']);
  const job = value.jobs.cleanup;
  assert.equal(job.environment, 'hosted-gate-2b');
  assert.equal(job['timeout-minutes'], 5);
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal('env' in job, false);
  assert.equal(job.steps.length, 1);
  const step = job.steps[0];
  assert.equal(step.name, 'Remove expired community media');
  assert.equal(step['timeout-minutes'], 2);
  assert.equal(step.env.SUPABASE_URL, 'https://fhugdtpjbgiatqhvjioy.supabase.co');
  assert.equal(step.env.SUPABASE_SERVICE_ROLE_KEY, '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
  assert.match(step.run, /curl --fail --silent --show-error --max-time 30 --request POST/);
  assert.match(step.run, /Authorization: Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}/);
  assert.match(step.run, /"\$\{SUPABASE_URL\}\/functions\/v1\/cleanup-community-media"/);
  assert.doesNotMatch(step.run, /--data|Content-Type|echo|set -x/);
  assert.doesNotMatch(source, /contents:\s*write/);
}

test('provides bounded manual cleanup using only the environment service credential', async () => {
  const { source, value } = await workflow();
  assertContract(source, value);
});

test('rejects schedule, environment, credential, and request drift', async () => {
  const { source, value } = await workflow();
  const mutations = [
    (item) => { item.on.schedule = [{ cron: '*/15 * * * *' }]; },
    (item) => { item.jobs.cleanup.environment = 'production'; },
    (item) => { item.jobs.cleanup.permissions = { contents: 'write' }; },
    (item) => { item.jobs.cleanup.steps[0].env.SUPABASE_SERVICE_ROLE_KEY = 'plain-secret'; },
    (item) => { item.jobs.cleanup.steps[0].run = 'curl --request GET'; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(value);
    mutate(candidate);
    assert.throws(() => assertContract(source, candidate));
  }
});
