import assert from 'node:assert/strict';
import test from 'node:test';

import { configureHostedAuth, runPilotGate2B } from './run-pilot-gate-2b.mjs';
import { DEPLOYED_FUNCTIONS } from './pilot-gate-2b-inputs.mjs';

test('configures and reads back the exact Auth redirects', async () => {
  const calls = [];
  const fetchAdapter = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
    }), { status: 200 });
  };
  await configureHostedAuth({ fetchAdapter, accessToken: 'token-value' });
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['PATCH', 'https://api.supabase.com/v1/projects/fhugdtpjbgiatqhvjioy/config/auth'],
    ['GET', 'https://api.supabase.com/v1/projects/fhugdtpjbgiatqhvjioy/config/auth'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
  });
});

test('rejects wildcard or unrelated Auth readback', async () => {
  const fetchAdapter = async () => new Response(JSON.stringify({
    site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback,http://*',
  }), { status: 200 });
  await assert.rejects(configureHostedAuth({ fetchAdapter, accessToken: 'token-value' }), /hosted_auth_invalid/);
});

test('deploys incrementally in fixed order without privileged command arguments', async () => {
  const commands = [];
  const processAdapter = {
    run: async (command, args, options) => {
      commands.push({ command, args, options });
      return { stdout: command === 'git' ? `${'a'.repeat(40)}\n` : '' };
    },
    writeEdgeSecretFile: async () => 'C:/temp/edge.env',
    removeTemporaryFiles: async () => undefined,
  };
  const fetchAdapter = async () => new Response(JSON.stringify({
    site_url: 'animalhelper://', uri_allow_list: 'animalhelper://auth/callback',
  }), { status: 200 });
  const values = {
    SUPABASE_ACCESS_TOKEN: 'access-secret',
    SUPABASE_DATABASE_URL: 'postgresql://postgres.fhugdtpjbgiatqhvjioy:db-secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service', SUPABASE_PUBLIC_KEY: 'sb_publishable_public',
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    GITHUB_REPOSITORY: 'ZP151/anicare', GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/codex/hosted-gate-2b', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ENVIRONMENT: 'hosted-gate-2b',
  };
  await runPilotGate2B({ repoRoot: 'C:/repo', processAdapter, fetchAdapter, parentEnvironment: values,
    discoverInputs: () => ({}), outputAdapter: { write: () => undefined } });
  assert.deepEqual(commands.map(({ command, args }) => [command, ...args]), [
    ['git', 'rev-parse', 'HEAD'],
    ['supabase', 'link', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ['supabase', 'db', 'push', '--dry-run'],
    ['supabase', 'db', 'push'],
    ['supabase', 'secrets', 'set', '--env-file', 'C:/temp/edge.env', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ...DEPLOYED_FUNCTIONS.map((name) => ['supabase', 'functions', 'deploy', name, '--project-ref', 'fhugdtpjbgiatqhvjioy', '--use-api']),
    ['pnpm', '--filter', '@animalhelper/pilot-gate-2b', 'test:integration'],
  ]);
  const commandText = JSON.stringify(commands.map(({ command, args }) => [command, args]));
  assert.equal(commandText.includes('access-secret') || commandText.includes('db-secret') ||
    commandText.includes('sb_secret_service'), false);
  const forbidden = new Set(['reset', 'repair', 'seed', 'dump', 'restore', 'prune', 'delete', 'pause', 'query']);
  assert.equal(commands.some(({ command, args }) => [command, ...args].some((token) => forbidden.has(token))), false);
});
