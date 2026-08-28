import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INTEGRATION_DIRECTORY = 'tests/pilot-gate-2a/src';
const ENVIRONMENT_GUARD = `${INTEGRATION_DIRECTORY}/environment.ts`;
const ENDPOINT_MODULE = `${INTEGRATION_DIRECTORY}/edge-endpoints.ts`;
const FETCH_GUARD = `${INTEGRATION_DIRECTORY}/local-fetch-guard.ts`;
const INTEGRATION_SETUP = `${INTEGRATION_DIRECTORY}/integration-setup.ts`;
const ENDPOINT_MANIFEST = 'tests/pilot-gate-2a/edge-endpoints.json';
const INTEGRATION_CONFIG = 'tests/pilot-gate-2a/vitest.integration.config.ts';
const READINESS_TEST = `${INTEGRATION_DIRECTORY}/readiness.integration.test.ts`;
const PACKAGE_SOURCE_PREFIX = 'tests/pilot-gate-2a/';

const REVIEWED_GATE_2A_ENDPOINTS = Object.freeze({
  cleanupMediaStaging: 'cleanup-media-staging',
  createSighting: 'create-sighting',
  deleteMedia: 'delete-media',
  finalizeMediaUpload: 'finalize-media-upload',
  reserveMediaUpload: 'reserve-media-upload',
});

export const GATE_2A_EDGE_ENDPOINTS = Object.freeze(Object.values(REVIEWED_GATE_2A_ENDPOINTS).sort());

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

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function readEndpointManifest(repoRoot) {
  const absolutePath = path.join(repoRoot, ...ENDPOINT_MANIFEST.split('/'));
  if (!existsSync(absolutePath)) throw new Error(`missing Gate 2A endpoint manifest: ${ENDPOINT_MANIFEST}`);
  const source = readFileSync(absolutePath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    throw new Error('invalid Gate 2A endpoint manifest');
  }
  for (const name of ['version', 'endpoints', ...Object.keys(REVIEWED_GATE_2A_ENDPOINTS)]) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const occurrences = source.match(new RegExp(`"${escaped}"\\s*:`, 'g'))?.length ?? 0;
    if (occurrences !== 1) throw new Error('invalid Gate 2A endpoint manifest');
  }
  if (
    !plainRecord(manifest) ||
    manifest.version !== 1 ||
    !plainRecord(manifest.endpoints) ||
    Object.keys(manifest).sort().join(',') !== 'endpoints,version'
  ) {
    throw new Error('invalid Gate 2A endpoint manifest');
  }

  for (const [name, slug] of Object.entries(manifest.endpoints)) {
    if (!Object.hasOwn(REVIEWED_GATE_2A_ENDPOINTS, name)) {
      throw new Error(`unreviewed Gate 2A Edge endpoint manifest entry: ${name}`);
    }
    if (REVIEWED_GATE_2A_ENDPOINTS[name] !== slug) {
      throw new Error(`invalid Gate 2A Edge endpoint manifest mapping: ${name}`);
    }
  }
  for (const name of Object.keys(REVIEWED_GATE_2A_ENDPOINTS)) {
    if (!Object.hasOwn(manifest.endpoints, name)) {
      throw new Error(`missing Gate 2A Edge endpoint manifest entry: ${name}`);
    }
  }
  return Object.values(manifest.endpoints).sort();
}

function configurationTokens(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index + 2);
      if (index === -1) break;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) return [];
      index = end + 2;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      const quote = character;
      let value = '';
      let closed = false;
      index += 1;
      while (index < source.length) {
        const next = source[index];
        if (next === '\\' && index + 1 < source.length) {
          value += source[index + 1];
          index += 2;
        } else if (next === quote) {
          index += 1;
          closed = true;
          break;
        } else {
          value += next;
          index += 1;
        }
      }
      if (!closed) return [];
      tokens.push({ type: 'string', value, quote });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0];
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier });
      index += identifier.length;
      continue;
    }
    if ('{}[]():,'.includes(character)) tokens.push({ type: 'punctuator', value: character });
    index += 1;
  }
  return tokens;
}

function directPropertyValues(tokens, objectStart, propertyName) {
  const values = [];
  let depth = 0;
  for (let index = objectStart + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === '}' && depth === 0) return values;
    if (depth === 0 && token.value === propertyName && tokens[index + 1]?.value === ':') values.push(index + 2);
    if (token.value === '{' || token.value === '[' || token.value === '(') depth += 1;
    if (token.value === '}' || token.value === ']' || token.value === ')') depth -= 1;
  }
  return values;
}

function endpointBuilderCalls(source) {
  const calls = [];
  const tokens = configurationTokens(source);
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (tokens[index]?.type !== 'identifier' || tokens[index]?.value !== 'edgeEndpointUrl' || tokens[index + 1]?.value !== '(') {
      continue;
    }
    let depth = 1;
    let argument = 0;
    for (let cursor = index + 2; cursor < tokens.length && depth > 0; cursor += 1) {
      const token = tokens[cursor];
      if (token.value === '(' || token.value === '[' || token.value === '{') depth += 1;
      if (token.value === ')' || token.value === ']' || token.value === '}') depth -= 1;
      if (depth === 1 && token.value === ',') {
        argument += 1;
        if (argument === 1 && tokens[cursor + 1]?.type === 'string') calls.push(tokens[cursor + 1].value);
      }
    }
  }
  return calls;
}

function discoverHarnessEndpointUsages(repoRoot, sourceFiles) {
  const usages = new Set();
  for (const file of sourceFiles) {
    const relativePath = toPosixRelative(repoRoot, file);
    const executableHarnessSource = relativePath.endsWith('.integration.test.ts') || !relativePath.endsWith('.test.ts');
    if (!executableHarnessSource || relativePath === ENDPOINT_MODULE) continue;
    for (const endpoint of endpointBuilderCalls(readFileSync(file, 'utf8'))) usages.add(endpoint);
  }
  return [...usages].sort();
}

function validatePilotGate2AIntegrationSetup(source) {
  const tokens = typeof source === 'string' ? configurationTokens(source) : [];
  const expected = [
    'import', '{', 'installPilotGate2AFetchBoundary', '}', 'from', './local-fetch-guard.js',
    'installPilotGate2AFetchBoundary', '(', 'process', 'env', ',', 'globalThis', ')',
  ];
  if (tokens.length !== expected.length || expected.some((value, index) => tokens[index]?.value !== value)) {
    throw new Error('missing mandatory Gate 2A global fetch boundary installation');
  }
}

export function validatePilotGate2AIntegrationConfig(source) {
  if (typeof source !== 'string') throw new Error('missing mandatory Gate 2A integration setup');
  const tokens = configurationTokens(source);
  const marker = ['export', 'default', 'defineConfig', '(', '{'];
  const configurationStarts = [];
  for (let index = 0; index <= tokens.length - marker.length; index += 1) {
    if (marker.every((value, offset) => tokens[index + offset]?.value === value)) {
      configurationStarts.push(index + marker.length - 1);
    }
  }
  const testValues = configurationStarts.length === 1
    ? directPropertyValues(tokens, configurationStarts[0], 'test')
    : [];
  const setupValues = testValues.length === 1 && tokens[testValues[0]]?.value === '{'
    ? directPropertyValues(tokens, testValues[0], 'setupFiles')
    : [];
  const setupValue = setupValues.length === 1 ? setupValues[0] : -1;
  if (
    setupValue < 0 ||
    tokens[setupValue]?.value !== '[' ||
    tokens[setupValue + 1]?.type !== 'string' ||
    tokens[setupValue + 1]?.quote === '`' ||
    tokens[setupValue + 1]?.value !== './src/integration-setup.ts' ||
    tokens[setupValue + 2]?.value !== ']'
  ) {
    throw new Error('missing mandatory Gate 2A integration setup');
  }
  return { setupFile: './src/integration-setup.ts' };
}

export function discoverPilotGate2AInputs(repoRoot) {
  const sourceDirectory = path.join(repoRoot, ...INTEGRATION_DIRECTORY.split('/'));
  const sourceFiles = walkFiles(sourceDirectory).filter((file) => file.endsWith('.ts'));
  const integrationTests = sourceFiles
    .filter((file) => file.endsWith('.integration.test.ts'))
    .map((file) => toPosixRelative(repoRoot, file))
    .sort();
  const manifestEndpoints = readEndpointManifest(repoRoot);
  const edgeHandlers = manifestEndpoints
    .map((endpoint) => `supabase/functions/${endpoint}/index.ts`)
    .filter((relativePath) => existsSync(path.join(repoRoot, ...relativePath.split('/'))));
  const environmentPath = path.join(repoRoot, ...ENVIRONMENT_GUARD.split('/'));
  const endpointModulePath = path.join(repoRoot, ...ENDPOINT_MODULE.split('/'));
  const fetchGuardPath = path.join(repoRoot, ...FETCH_GUARD.split('/'));
  const integrationSetupPath = path.join(repoRoot, ...INTEGRATION_SETUP.split('/'));
  const integrationConfigPath = path.join(repoRoot, ...INTEGRATION_CONFIG.split('/'));
  let integrationSetupConfigured = false;
  if (existsSync(integrationConfigPath)) {
    try {
      validatePilotGate2AIntegrationConfig(readFileSync(integrationConfigPath, 'utf8'));
      integrationSetupConfigured = true;
    } catch {
      integrationSetupConfigured = false;
    }
  }
  let integrationSetupInstallsBoundary = false;
  if (existsSync(integrationSetupPath)) {
    try {
      validatePilotGate2AIntegrationSetup(readFileSync(integrationSetupPath, 'utf8'));
      integrationSetupInstallsBoundary = true;
    } catch {
      integrationSetupInstallsBoundary = false;
    }
  }
  const forbiddenEndpointLiterals = sourceFiles
    .filter((file) => toPosixRelative(repoRoot, file) !== ENDPOINT_MODULE)
    .filter((file) => readFileSync(file, 'utf8').includes('/functions/v1/'))
    .map((file) => toPosixRelative(repoRoot, file))
    .sort();
  const usedEndpointNames = discoverHarnessEndpointUsages(repoRoot, sourceFiles);

  return {
    integrationTests,
    edgeHandlers,
    manifestEndpoints,
    endpointManifest: ENDPOINT_MANIFEST,
    endpointModule: existsSync(endpointModulePath) ? ENDPOINT_MODULE : null,
    fetchGuard: existsSync(fetchGuardPath) ? FETCH_GUARD : null,
    environmentGuard: existsSync(environmentPath) ? ENVIRONMENT_GUARD : null,
    integrationSetup: existsSync(integrationSetupPath) ? INTEGRATION_SETUP : null,
    integrationConfig: existsSync(integrationConfigPath) ? INTEGRATION_CONFIG : null,
    integrationSetupConfigured,
    integrationSetupInstallsBoundary,
    forbiddenEndpointLiterals,
    usedEndpointNames,
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
  if (inputs.endpointManifest !== ENDPOINT_MANIFEST) {
    throw new Error(`missing Gate 2A endpoint manifest: ${ENDPOINT_MANIFEST}`);
  }
  if (inputs.endpointModule !== ENDPOINT_MODULE) {
    throw new Error(`missing Gate 2A endpoint module: ${ENDPOINT_MODULE}`);
  }
  if (inputs.fetchGuard !== FETCH_GUARD) {
    throw new Error(`missing Gate 2A global fetch guard: ${FETCH_GUARD}`);
  }
  if (inputs.integrationSetup !== INTEGRATION_SETUP) {
    throw new Error(`missing Gate 2A integration setup: ${INTEGRATION_SETUP}`);
  }
  if (inputs.integrationConfig !== INTEGRATION_CONFIG || !inputs.integrationSetupConfigured) {
    throw new Error('missing mandatory Gate 2A integration setup');
  }
  if (!inputs.integrationSetupInstallsBoundary) {
    throw new Error('missing mandatory Gate 2A global fetch boundary installation');
  }
  if (inputs.forbiddenEndpointLiterals.length > 0) {
    throw new Error(`literal Gate 2A Edge path outside approved endpoint module: ${inputs.forbiddenEndpointLiterals[0]}`);
  }
  for (const name of inputs.usedEndpointNames) {
    if (!Object.hasOwn(REVIEWED_GATE_2A_ENDPOINTS, name)) {
      throw new Error(`unreviewed Gate 2A Edge endpoint builder usage: ${name}`);
    }
  }
  const endpointUsages = new Set(inputs.usedEndpointNames);
  for (const name of Object.keys(REVIEWED_GATE_2A_ENDPOINTS)) {
    if (!endpointUsages.has(name)) {
      throw new Error(`Gate 2A Edge endpoint is not used by executable harness source: ${name}`);
    }
  }

  const discoveredHandlers = new Set(inputs.edgeHandlers);
  for (const endpoint of GATE_2A_EDGE_ENDPOINTS) {
    const handler = `supabase/functions/${endpoint}/index.ts`;
    if (!discoveredHandlers.has(handler)) {
      throw new Error(`missing Gate 2A Edge handler: ${handler}`);
    }
  }

  if (
    inputs.manifestEndpoints.length !== GATE_2A_EDGE_ENDPOINTS.length ||
    inputs.manifestEndpoints.some((endpoint, index) => endpoint !== GATE_2A_EDGE_ENDPOINTS[index])
  ) {
    throw new Error('Gate 2A endpoint manifest does not match the reviewed exact-five contract');
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
