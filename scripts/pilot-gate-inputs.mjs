import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const POSIX = path.posix;

function toRelativePosixPath(repoRoot, absolutePath) {
  return POSIX.normalize(path.relative(repoRoot, absolutePath).split(path.sep).join(POSIX.sep));
}

function readDirectory(directory) {
  return readdirSync(directory, { withFileTypes: true });
}

export function discoverPilotGateInputs(repoRoot) {
  const sqlDirectory = path.join(repoRoot, 'supabase', 'tests');
  const functionsDirectory = path.join(repoRoot, 'supabase', 'functions');

  const sqlTests = readDirectory(sqlDirectory)
    .filter((entry) => entry.isFile() && /^[0-9].*\.sql$/.test(entry.name))
    .map((entry) => toRelativePosixPath(repoRoot, path.join(sqlDirectory, entry.name)))
    .sort();

  const edgeHandlers = readDirectory(functionsDirectory)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(functionsDirectory, entry.name, 'index.ts'))
    .filter(existsSync)
    .map((entrypoint) => toRelativePosixPath(repoRoot, entrypoint))
    .sort();

  return { sqlTests, edgeHandlers };
}

export function buildDenoCheckArgs(edgeHandlers, frozen = true) {
  return [
    'check',
    '--config', 'supabase/functions/deno.json',
    '--lock', 'supabase/functions/deno.lock',
    `--frozen=${frozen}`,
    ...edgeHandlers,
  ];
}

function requireInputs(inputs) {
  if (inputs.sqlTests.length === 0) {
    throw new Error('no SQL test files found under supabase/tests/[0-9]*.sql');
  }
  if (inputs.edgeHandlers.length === 0) {
    throw new Error('no direct Edge handlers found under supabase/functions/*/index.ts');
  }
}

function childExitCode(result) {
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function runUuidValidation(repoRoot, sqlTests) {
  const validator = 'supabase/tests/validate_sql_uuid_literals.py';
  const python = process.platform === 'win32' ? 'python' : 'python3';

  for (const sqlTest of sqlTests) {
    const exitCode = childExitCode(spawnSync(python, [validator, sqlTest], {
      cwd: repoRoot,
      stdio: 'inherit',
    }));
    if (exitCode !== 0) {
      return exitCode;
    }
  }
  return 0;
}

function runDenoCheck(repoRoot, edgeHandlers) {
  return childExitCode(spawnSync('deno', buildDenoCheckArgs(edgeHandlers, true), {
    cwd: repoRoot,
    env: { ...process.env, DENO_NO_PACKAGE_JSON: '1' },
    stdio: 'inherit',
  }));
}

function main(argv) {
  const [mode] = argv;
  if (mode !== 'uuid' && mode !== 'deno') {
    console.error('usage: node scripts/pilot-gate-inputs.mjs <uuid|deno>');
    return 2;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const inputs = discoverPilotGateInputs(repoRoot);
  try {
    requireInputs(inputs);
    return mode === 'uuid'
      ? runUuidValidation(repoRoot, inputs.sqlTests)
      : runDenoCheck(repoRoot, inputs.edgeHandlers);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
