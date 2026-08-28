import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INTEGRATION_DIRECTORY = 'tests/pilot-gate-2a/src';
const ENVIRONMENT_GUARD = `${INTEGRATION_DIRECTORY}/environment.ts`;
const READINESS_TEST = `${INTEGRATION_DIRECTORY}/readiness.integration.test.ts`;
const PACKAGE_SOURCE_PREFIX = 'tests/pilot-gate-2a/';

export const GATE_2A_EDGE_ENDPOINTS = Object.freeze([
  'cleanup-media-staging',
  'create-sighting',
  'delete-media',
  'finalize-media-upload',
  'reserve-media-upload',
]);

function toPosixRelative(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join(path.posix.sep);
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(target));
    } else if (entry.isFile()) {
      files.push(target);
    }
  }
  return files;
}

function discoverEndpointReferences(sourceFiles) {
  const endpoints = new Set();
  const endpointPattern = /\/functions\/v1\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;
  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, 'utf8');
    for (const match of source.matchAll(endpointPattern)) {
      endpoints.add(match[1]);
    }
  }
  return [...endpoints].sort();
}

export function discoverPilotGate2AInputs(repoRoot) {
  const sourceDirectory = path.join(repoRoot, ...INTEGRATION_DIRECTORY.split('/'));
  const sourceFiles = walkFiles(sourceDirectory).filter((file) => file.endsWith('.ts'));
  const integrationTests = sourceFiles
    .filter((file) => file.endsWith('.integration.test.ts'))
    .map((file) => toPosixRelative(repoRoot, file))
    .sort();
  const edgeHandlers = GATE_2A_EDGE_ENDPOINTS
    .map((endpoint) => `supabase/functions/${endpoint}/index.ts`)
    .filter((relativePath) => existsSync(path.join(repoRoot, ...relativePath.split('/'))));
  const environmentPath = path.join(repoRoot, ...ENVIRONMENT_GUARD.split('/'));

  return {
    integrationTests,
    edgeHandlers,
    referencedEndpoints: discoverEndpointReferences(sourceFiles),
    environmentGuard: existsSync(environmentPath) ? ENVIRONMENT_GUARD : null,
  };
}

export function validatePilotGate2AInputs(inputs) {
  if (inputs.integrationTests.length === 0) {
    throw new Error('no Gate 2A integration tests found');
  }
  if (!inputs.integrationTests.includes(READINESS_TEST)) {
    throw new Error(`missing Gate 2A readiness test: ${READINESS_TEST}`);
  }
  if (inputs.environmentGuard !== ENVIRONMENT_GUARD) {
    throw new Error(`missing Gate 2A environment guard: ${ENVIRONMENT_GUARD}`);
  }

  const discoveredHandlers = new Set(inputs.edgeHandlers);
  for (const endpoint of GATE_2A_EDGE_ENDPOINTS) {
    const handler = `supabase/functions/${endpoint}/index.ts`;
    if (!discoveredHandlers.has(handler)) {
      throw new Error(`missing Gate 2A Edge handler: ${handler}`);
    }
  }

  const allowedEndpoints = new Set(GATE_2A_EDGE_ENDPOINTS);
  for (const endpoint of inputs.referencedEndpoints) {
    if (!allowedEndpoints.has(endpoint)) {
      throw new Error(`unreviewed Gate 2A Edge endpoint: ${endpoint}`);
    }
  }
  const referencedEndpoints = new Set(inputs.referencedEndpoints);
  for (const endpoint of GATE_2A_EDGE_ENDPOINTS) {
    if (!referencedEndpoints.has(endpoint)) {
      throw new Error(`Gate 2A Edge endpoint is not exercised: ${endpoint}`);
    }
  }

  return inputs;
}

export function buildPilotGate2ATestArgs(integrationTests, { readinessOnly = false } = {}) {
  const selected = readinessOnly ? [READINESS_TEST] : [...integrationTests];
  if (!integrationTests.includes(READINESS_TEST)) {
    throw new Error('Gate 2A readiness test is not discoverable');
  }
  if (selected.some((testPath) => !testPath.startsWith(PACKAGE_SOURCE_PREFIX) || !testPath.endsWith('.integration.test.ts'))) {
    throw new Error('invalid Gate 2A integration test path');
  }

  return [
    '--filter', '@animalhelper/pilot-gate-2a',
    'exec', 'vitest', 'run',
    '--config', 'vitest.integration.config.ts',
    ...selected.map((testPath) => testPath.slice(PACKAGE_SOURCE_PREFIX.length)),
  ];
}

function databaseContractsJob(workflow) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => /^  database-contracts:\s*$/.test(line));
  if (start === -1) throw new Error('missing database-contracts job');
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [a-zA-Z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end);
}

function workflowSteps(jobLines) {
  const starts = [];
  for (let index = 0; index < jobLines.length; index += 1) {
    if (/^      - /.test(jobLines[index])) starts.push(index);
  }
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? jobLines.length;
    return jobLines.slice(start, end).join('\n');
  });
}

function requiredStep(steps, marker, error) {
  const index = steps.findIndex((step) => step.includes(marker));
  if (index === -1) throw new Error(error);
  return { index, source: steps[index] };
}

function yamlScalar(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

function actionInput(step, name) {
  const match = step.match(new RegExp(`^\\s+${name}:\\s*(.+?)\\s*$`, 'm'));
  return match ? yamlScalar(match[1]) : null;
}

export function validatePilotGate2AWorkflow(workflow) {
  if (typeof workflow !== 'string') throw new Error('invalid CI workflow');
  const jobLines = databaseContractsJob(workflow);
  const job = jobLines.join('\n');
  if (/\bcontinue-on-error\s*:/.test(job)) throw new Error('database-contracts must not use continue-on-error');
  if (/\bsupabase\s+(?:start|status|stop|functions\s+serve|test\s+db|db\s+lint)\b/.test(job)) {
    throw new Error('database-contracts contains a raw Supabase lifecycle command');
  }
  if (/(?:^|\s)--all(?:\s|$)/m.test(job)) throw new Error('database-contracts must not use --all');

  const steps = workflowSteps(jobLines);
  const pnpmSetup = requiredStep(steps, 'uses: pnpm/action-setup@v4', 'missing pinned pnpm setup');
  const nodeSetup = requiredStep(steps, 'uses: actions/setup-node@v4', 'missing pinned Node setup');
  const denoSetup = requiredStep(steps, 'uses: denoland/setup-deno@v2', 'missing pinned Deno setup');
  const supabaseSetup = requiredStep(steps, 'uses: supabase/setup-cli@v2', 'missing pinned Supabase setup');
  const frozenInstall = requiredStep(steps, 'run: pnpm install --frozen-lockfile', 'missing frozen pnpm install');
  const orchestrationTests = requiredStep(
    steps,
    'run: pnpm test:pilot-gate-2a-ci',
    'missing Gate 2A orchestration unit tests',
  );
  const gateInputDiscovery = requiredStep(
    steps,
    'run: node scripts/pilot-gate-2a-inputs.mjs',
    'missing Gate 2A input discovery gate',
  );
  const uuidSourceGate = requiredStep(
    steps,
    'run: node scripts/pilot-gate-inputs.mjs uuid',
    'missing SQL UUID source gate',
  );
  const denoSourceGate = requiredStep(
    steps,
    'run: node scripts/pilot-gate-inputs.mjs deno',
    'missing Deno source gate',
  );
  const guardedGate = requiredStep(steps, 'run: pnpm pilot-gate-2a', 'missing guarded Gate 2A runner');
  const sanitizedArtifact = requiredStep(
    steps,
    'uses: actions/upload-artifact@v4',
    'missing sanitized failure artifact upload',
  );
  const diagnosticCleanup = requiredStep(
    steps,
    'run: pnpm pilot-gate-2a:cleanup-diagnostic',
    'missing failure diagnostic cleanup',
  );

  const pnpm = actionInput(pnpmSetup.source, 'version');
  const node = actionInput(nodeSetup.source, 'node-version');
  const nodeCache = actionInput(nodeSetup.source, 'cache');
  const deno = actionInput(denoSetup.source, 'deno-version');
  const supabase = actionInput(supabaseSetup.source, 'version');
  if (pnpm !== '11.19.0') throw new Error('pnpm must be pinned to 11.19.0');
  if (node !== '22' || nodeCache !== 'pnpm') throw new Error('Node must be pinned to 22 with pnpm cache');
  if (deno !== 'v2.9.5') throw new Error('Deno must be pinned to v2.9.5');
  if (supabase !== '2.84.2') throw new Error('Supabase CLI must be pinned to 2.84.2');
  if (!guardedGate.source.includes('id: pilot_gate_2a') || !guardedGate.source.includes('TMPDIR: ${{ runner.temp }}')) {
    throw new Error('guarded Gate 2A step is missing its id or OS temporary directory binding');
  }
  if (
    !sanitizedArtifact.source.includes("if: failure() && steps.pilot_gate_2a.outcome == 'failure'") ||
    !sanitizedArtifact.source.includes('path: ${{ runner.temp }}/animalhelper-pilot-gate-2a-failure.log') ||
    !sanitizedArtifact.source.includes('if-no-files-found: error')
  ) {
    throw new Error('failure artifact is not strictly bound to the sanitized diagnostic');
  }
  if (
    !diagnosticCleanup.source.includes('if: always()') ||
    !diagnosticCleanup.source.includes('TMPDIR: ${{ runner.temp }}')
  ) {
    throw new Error('failure diagnostic cleanup must be unconditional and use the bound OS temporary directory');
  }

  const ordered = [
    frozenInstall,
    orchestrationTests,
    gateInputDiscovery,
    uuidSourceGate,
    denoSourceGate,
    guardedGate,
    sanitizedArtifact,
    diagnosticCleanup,
  ];
  if (ordered.some((step, index) => index > 0 && step.index <= ordered[index - 1].index)) {
    throw new Error('Gate 2A workflow steps are out of dependency order');
  }
  if (
    pnpmSetup.index >= frozenInstall.index ||
    nodeSetup.index >= frozenInstall.index ||
    denoSetup.index >= denoSourceGate.index ||
    supabaseSetup.index >= guardedGate.index
  ) {
    throw new Error('Gate 2A tool setup is out of dependency order');
  }

  return {
    node,
    pnpm,
    deno,
    supabase,
    orderedSteps: [
      'frozen-install',
      'orchestration-tests',
      'gate-input-discovery',
      'uuid-source-gate',
      'deno-source-gate',
      'guarded-gate',
      'sanitized-artifact',
      'diagnostic-cleanup',
    ],
  };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const inputs = validatePilotGate2AInputs(discoverPilotGate2AInputs(repoRoot));
    validatePilotGate2AWorkflow(readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8'));
    process.stdout.write(
      `Pilot Gate 2A inputs verified: ${inputs.integrationTests.length} tests, ${inputs.edgeHandlers.length} endpoints.\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`Pilot Gate 2A input validation failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
