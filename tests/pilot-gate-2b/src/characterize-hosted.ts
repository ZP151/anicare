import { randomUUID } from 'node:crypto';
import { chmod, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  finalizeMedia,
  putSignedMedia,
  reserveMedia,
  type ActorResult,
  type ReserveInput,
} from '../../pilot-gate-2a/src/actors.js';
import { deterministicJpegFixture } from '../../pilot-gate-2a/src/jpeg-fixture.js';
import { writeCleanupLedger } from './cleanup-ledger.js';
import { readHostedGateEnvironment } from './environment.js';
import { createHostedScenario, type HostedFixtureProgress } from './fixtures.js';
import { buildPerformanceReport, type PerformanceOutcomes } from './performance.js';

const SUCCESS_SAMPLES = 20;
const MAX_ATTEMPTS = 25;

type CleanupLedger = {
  createdAuthRecoveryIds: string[];
  createdUserIds: string[];
  sightingRecoveryReferences: Array<{ reporterId: string; clientDedupeKey: string }>;
  createdSightingIds: string[];
  createdMediaIds: string[];
  createdJobIds: string[];
  createdAssetIds: string[];
  createdObjectPaths: string[];
};

function reservationInput(sightingId: string, mediaId: string, digest: string, byteLength: number): ReserveInput {
  return {
    sightingId,
    mediaId,
    sha256: digest,
    byteLength,
    review: {
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 1,
      height: 1,
      confirmedAtLocal: new Date().toISOString(),
    },
  };
}

function classify(result: ActorResult): keyof Omit<PerformanceOutcomes, 'success'> {
  if (result.ok) throw new Error('hosted_characterization_invalid');
  if (result.code === 'request_timeout') return 'timeout';
  return result.kind === 'http' ? 'http_error' : 'transport_error';
}

function performancePath(value: string | undefined): string {
  if (!value || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) {
    throw new Error('hosted_characterization_invalid');
  }
  const resolved = path.resolve(value);
  if (path.basename(resolved) !== 'hosted-gate-2b-performance.json') {
    throw new Error('hosted_characterization_invalid');
  }
  return resolved;
}

async function main(): Promise<void> {
  const env = readHostedGateEnvironment(process.env);
  if (env.mode !== 'characterize' || env.finalizeTimeoutMs !== 30_000) {
    throw new Error('hosted_characterization_invalid');
  }
  const ledgerPath = process.env.PILOT_GATE_2B_LEDGER_PATH;
  if (!ledgerPath) throw new Error('cleanup_ledger_invalid');
  const reportPath = performancePath(process.env.PILOT_GATE_2B_PERFORMANCE_PATH);
  const ledger: CleanupLedger = {
    createdAuthRecoveryIds: [],
    createdUserIds: [],
    sightingRecoveryReferences: [],
    createdSightingIds: [],
    createdMediaIds: [],
    createdJobIds: [],
    createdAssetIds: [],
    createdObjectPaths: [],
  };
  await writeCleanupLedger(ledgerPath, ledger);
  const onProgress = async (progress: HostedFixtureProgress) => {
    if (progress.kind === 'auth-reference') ledger.createdAuthRecoveryIds.push(progress.recoveryId);
    else if (progress.kind === 'user') ledger.createdUserIds.push(progress.id);
    else if (progress.kind === 'sighting-reference') {
      ledger.sightingRecoveryReferences.push({
        reporterId: progress.reporterId,
        clientDedupeKey: progress.clientDedupeKey,
      });
    } else ledger.createdSightingIds.push(progress.id);
    await writeCleanupLedger(ledgerPath, ledger);
  };
  const scenario = await createHostedScenario(env, undefined, onProgress);
  ledger.createdUserIds = [...scenario.createdUserIds];
  ledger.createdSightingIds = [scenario.ownerSightingId, scenario.strangerSightingId];
  await writeCleanupLedger(ledgerPath, ledger);

  const jpeg = deterministicJpegFixture();
  const samples: number[] = [];
  const outcomes = {
    success: 0,
    http_error: 0,
    transport_error: 0,
    timeout: 0,
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS && samples.length < SUCCESS_SAMPLES; attempt += 1) {
    const mediaId = randomUUID();
    ledger.createdMediaIds.push(mediaId);
    await writeCleanupLedger(ledgerPath, ledger);
    let reservation;
    try {
      reservation = await reserveMedia(
        scenario.owner,
        reservationInput(scenario.ownerSightingId, mediaId, jpeg.sha256, jpeg.bytes.byteLength),
        env,
      );
    } catch {
      outcomes.transport_error += 1;
      continue;
    }
    ledger.createdJobIds.push(reservation.jobId);
    ledger.createdObjectPaths.push(reservation.path);
    await writeCleanupLedger(ledgerPath, ledger);
    const upload = await putSignedMedia(reservation, jpeg.bytes);
    if (!upload.ok) {
      outcomes[classify(upload)] += 1;
      continue;
    }

    const startedAt = performance.now();
    const finalized = await finalizeMedia(scenario.owner, {
      sightingId: scenario.ownerSightingId,
      mediaId,
      sha256: jpeg.sha256,
    }, env, { timeoutMs: 30_000 });
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (!finalized.ok) {
      outcomes[classify(finalized)] += 1;
      continue;
    }
    if (!finalized.mediaAssetId) throw new Error('hosted_characterization_invalid');
    ledger.createdAssetIds.push(finalized.mediaAssetId);
    await writeCleanupLedger(ledgerPath, ledger);
    samples.push(elapsedMs);
    outcomes.success += 1;
  }

  const report = buildPerformanceReport({
    sourceCommit: env.sourceCommit,
    workflowRunId: env.workflowRunId,
    workflowRunAttempt: env.workflowRunAttempt,
    edgeRegion: 'ap-southeast-1',
    projectRegion: 'ap-southeast-1',
  }, samples, outcomes);
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(reportPath, 0o600);
  const metadata = await lstat(reportPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() ||
      (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) {
    throw new Error('hosted_characterization_invalid');
  }
  process.stdout.write('hosted_characterization_passed\n');
}

main().catch(() => {
  process.stderr.write('hosted_characterization_failed\n');
  process.exitCode = 1;
});
