import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  deleteMedia, finalizeMedia, putSignedMedia, reserveMedia, type ActorResult, type Reservation, type ReserveInput,
} from '../../pilot-gate-2a/src/actors.js';
import { deterministicJpegFixture } from '../../pilot-gate-2a/src/jpeg-fixture.js';
import { fetchWithTimeout } from '../../pilot-gate-2a/src/network.js';
import {
  HostedCheckFailure, ownerFinalizedMediaAssetId, runHostedChecks, type HostedCheckAdapter, type HostedMediaStagingStep,
  type HostedOwnerHappyPathStep,
} from './checks.js';
import { writeHostedCheckDiagnostic } from './check-diagnostic.js';
import { persistCleanupMediaId, writeCleanupLedger } from './cleanup-ledger.js';
import { readHostedGateEnvironment, type HostedGateEnvironment } from './environment.js';
import { executeHostedGate, hostedGateControlFromError, type MutableHostedScenario } from './execute.js';
import { createHostedScenario, type HostedFixtureProgress, type HostedScenario } from './fixtures.js';
import { writeChecksMarker } from './gate-markers.js';
import {
  createHostedInspectionSession,
  hostedIsolationStepFromError,
  type HostedInspection, type HostedInspectionInput, type HostedInspectionSession,
  type HostedIsolationInspection, type PartialHostedScenario,
} from './inspection.js';
import { verifyRemoteMigrationInventory } from './remote-state.js';
import { readDeniedStorageFailure, sameDeniedStorageFailure } from './storage-oracle.js';

const DENIED = new Set([400, 401, 403, 404, 406]);
const REQUEST_TIMEOUT_MS = 8_000;

type CleanupLedger = MutableHostedScenario & {
  createdAuthRecoveryIds: string[]; createdUserIds: string[];
  sightingRecoveryReferences: Array<{ reporterId: string; clientDedupeKey: string }>;
  createdSightingIds: string[]; createdMediaIds: string[];
  createdJobIds: string[]; createdAssetIds: string[]; createdObjectPaths: string[];
};
type RuntimeScenario = Readonly<{
  fixture: HostedScenario; tracked: CleanupLedger; inspection: HostedInspectionSession;
}>;
type FailureClass = Readonly<{ stage: string; status: number | null; code: string }>;

function failureClass(error: unknown): FailureClass | null {
  if (!error || typeof error !== 'object' || !('stage' in error) || !('status' in error) || !('code' in error)) return null;
  const { stage, status, code } = error as Record<string, unknown>;
  return typeof stage === 'string' && (typeof status === 'number' || status === null) && typeof code === 'string'
    ? { stage, status, code }
    : null;
}

function failedResult(result: ActorResult): FailureClass | null {
  return result.ok ? null : { stage: result.stage, status: result.status, code: result.code };
}

async function reserveFailure(
  actor: HostedScenario['owner'],
  input: ReserveInput,
  env: HostedGateEnvironment,
  signal: AbortSignal,
) {
  try {
    await reserveMedia(actor, input, env, { signal: signal, timeoutMs: env.finalizeTimeoutMs });
    return null;
  } catch (error) {
    return failureClass(error);
  }
}

function sameFailure(actual: FailureClass | null, unknown: FailureClass | null): boolean {
  return actual !== null && actual.status === 403 && JSON.stringify(actual) === JSON.stringify(unknown);
}

function sameInspection(actual: HostedInspection, expected: HostedInspection): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameIsolation(actual: HostedIsolationInspection, expected: HostedIsolationInspection): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function reservationInput(sightingId: string, mediaId: string, sha256: string, byteLength: number): ReserveInput {
  return {
    sightingId, mediaId, sha256, byteLength,
    review: {
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 1, height: 1, confirmedAtLocal: new Date().toISOString(),
    },
  };
}

describe('real Hosted Gate 2B', () => {
  it('executes the fixed hosted media readiness scenario', async () => {
    const env = readHostedGateEnvironment(process.env);
    await verifyRemoteMigrationInventory(env);
    const ledgerPath = process.env.PILOT_GATE_2B_LEDGER_PATH;
    if (!ledgerPath) throw new Error('cleanup_ledger_invalid');
    const checksPath = process.env.PILOT_GATE_2B_CHECKS_PATH;
    if (!checksPath) throw new Error('hosted_gate_marker_invalid');
    const partial: CleanupLedger = {
      createdAuthRecoveryIds: [], createdUserIds: [], sightingRecoveryReferences: [],
      createdSightingIds: [], createdMediaIds: [],
      createdJobIds: [], createdAssetIds: [], createdObjectPaths: [],
    };

    let result;
    try {
      result = await executeHostedGate({
      timeoutMs: 180_000,
      createScenario: async (ledger, signal) => {
        if (signal.aborted) throw new Error('aborted');
        Object.assign(ledger, partial);
        await writeCleanupLedger(ledgerPath, partial);
        const persistFixtureProgress = async (progress: HostedFixtureProgress) => {
          if (progress.kind === 'auth-reference') partial.createdAuthRecoveryIds.push(progress.recoveryId);
          else if (progress.kind === 'user') partial.createdUserIds.push(progress.id);
          else if (progress.kind === 'sighting-reference') {
            partial.sightingRecoveryReferences.push({
              reporterId: progress.reporterId, clientDedupeKey: progress.clientDedupeKey,
            });
          } else partial.createdSightingIds.push(progress.id);
          Object.assign(ledger, partial);
          await writeCleanupLedger(ledgerPath, partial);
        };
        const fixture = await createHostedScenario(env, undefined, persistFixtureProgress, signal);
        partial.createdUserIds = [...fixture.createdUserIds];
        partial.createdSightingIds = [fixture.ownerSightingId, fixture.strangerSightingId];
        Object.assign(ledger, partial);
        await writeCleanupLedger(ledgerPath, partial);
        return {
          fixture, tracked: partial, inspection: createHostedInspectionSession(env),
        } satisfies RuntimeScenario;
      },
      runChecks: async (value, signal) => {
        const { fixture: scenario, tracked, inspection } = value as RuntimeScenario;
        let ownerReservation: Reservation | undefined;
        let ownerExpected: HostedInspectionInput | undefined;
        let ownerBaseline: HostedInspection | undefined;
        let strangerReservation: Reservation | undefined;
        let mediaAssetId: string | undefined;
        let mediaId: string | undefined;
        const jpeg = deterministicJpegFixture();
        const admin = createClient(env.apiUrl, env.serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: (input, init) => fetchWithTimeout(input, { ...init, signal }, REQUEST_TIMEOUT_MS) },
        });
        const atMediaStep = async <T>(step: HostedMediaStagingStep, operation: () => Promise<T>): Promise<T> => {
          try {
            return await operation();
          } catch (error) {
            throw new HostedCheckFailure('media_staging', hostedIsolationStepFromError(error) ?? step);
          }
        };
        const requireMediaStep = (step: HostedMediaStagingStep, passed: boolean): void => {
          if (!passed) throw new HostedCheckFailure('media_staging', step);
        };
        const atOwnerStep = async <T>(step: HostedOwnerHappyPathStep, operation: () => Promise<T>): Promise<T> => {
          try {
            return await operation();
          } catch {
            throw new HostedCheckFailure('owner_happy_path', undefined, step);
          }
        };
        const requireOwnerStep = (step: HostedOwnerHappyPathStep, passed: boolean): void => {
          if (!passed) throw new HostedCheckFailure('owner_happy_path', undefined, step);
        };
        const authHeaders = (accessToken: string | null) => ({
          apikey: env.anonKey,
          Authorization: `Bearer ${accessToken ?? env.anonKey}`,
        });
        const readFailure = async (accessToken: string | null, objectPath: string) => {
          const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
          const response = await fetchWithTimeout(`${env.apiUrl}/storage/v1/object/media-staging/${encoded}`, {
            method: 'GET', redirect: 'error', cache: 'no-store', signal,
            headers: authHeaders(accessToken),
          }, REQUEST_TIMEOUT_MS);
          return await readDeniedStorageFailure(response);
        };
        const listHides = async (accessToken: string | null, objectPath: string): Promise<boolean> => {
          const response = await fetchWithTimeout(`${env.apiUrl}/storage/v1/object/list/media-staging`, {
            method: 'POST', redirect: 'error', cache: 'no-store', signal,
            headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: 'jobs/', limit: 100, offset: 0 }),
          }, REQUEST_TIMEOUT_MS);
          if (DENIED.has(response.status)) return true;
          if (!response.ok || response.status !== 200) return false;
          const body = await response.json().catch(() => null);
          return Array.isArray(body) && !body.some((item) => item && typeof item === 'object' &&
            ('name' in item) && `jobs/${String(item.name)}` === objectPath);
        };
        const unchanged = async (): Promise<boolean> => Boolean(ownerExpected && ownerBaseline) &&
          sameInspection(await inspection.inspectMedia(ownerExpected!, signal), ownerBaseline!);
        const isolationSnapshot = async (additionalMediaIds: readonly string[] = []) => {
          if (!ownerReservation || !strangerReservation || !mediaId) throw new Error('hosted_checks_failed');
          return await inspection.inspectIsolation({
            ownerId: scenario.owner.id,
            strangerId: scenario.stranger.id,
            ownerSightingId: scenario.ownerSightingId,
            strangerSightingId: scenario.strangerSightingId,
            mediaIds: [...new Set([mediaId, ...additionalMediaIds])],
            observedObjectPaths: [ownerReservation.path, strangerReservation.path],
          }, signal);
        };
        const withoutIsolationMutation = async <T>(
          operation: () => Promise<T>,
          additionalMediaIds: readonly string[] = [],
          operationStep?: HostedMediaStagingStep,
        ): Promise<Readonly<{ result: T; unchanged: boolean }>> => {
          const before = operationStep
            ? await atMediaStep('isolation_snapshot', () => isolationSnapshot(additionalMediaIds))
            : await isolationSnapshot(additionalMediaIds);
          const result = operationStep ? await atMediaStep(operationStep, operation) : await operation();
          const after = operationStep
            ? await atMediaStep('isolation_snapshot', () => isolationSnapshot(additionalMediaIds))
            : await isolationSnapshot(additionalMediaIds);
          return { result, unchanged: sameIsolation(after, before) };
        };

        const adapter: HostedCheckAdapter = {
          verifyAuthRedirects: async () => true,
          verifyPublicKeyOrigin: async (origin) => {
            const response = await fetchWithTimeout(`${origin}/auth/v1/settings`, {
              method: 'GET', redirect: 'error', cache: 'no-store', signal, headers: { apikey: env.anonKey },
            }, REQUEST_TIMEOUT_MS);
            return response.ok && !response.redirected && response.url.startsWith(`${origin}/`);
          },
          runOwnerHappyPath: async () => {
            const confirmedMediaId = randomUUID();
            mediaId = confirmedMediaId;
            partial.createdMediaIds = [confirmedMediaId];
            await atOwnerStep('ledger_media', () => writeCleanupLedger(ledgerPath, partial));
            ownerReservation = await atOwnerStep('reserve', () => reserveMedia(
              scenario.owner,
              reservationInput(scenario.ownerSightingId, confirmedMediaId, jpeg.sha256, jpeg.bytes.byteLength),
              env,
              { signal: signal, timeoutMs: env.finalizeTimeoutMs },
            ));
            partial.createdJobIds = [ownerReservation.jobId];
            partial.createdObjectPaths = [ownerReservation.path];
            await atOwnerStep('ledger_reserve', () => writeCleanupLedger(ledgerPath, partial));
            requireOwnerStep('upload', (await atOwnerStep(
              'upload', () => putSignedMedia(ownerReservation!, jpeg.bytes, {
                signal: signal, timeoutMs: env.finalizeTimeoutMs,
              }),
            )).ok);
            const finalized = await atOwnerStep('finalize', () => finalizeMedia(scenario.owner, {
              sightingId: scenario.ownerSightingId, mediaId: confirmedMediaId, sha256: jpeg.sha256,
            }, env, { signal: signal, timeoutMs: env.finalizeTimeoutMs }));
            const confirmedMediaAssetId = ownerFinalizedMediaAssetId(finalized);
            mediaAssetId = confirmedMediaAssetId;
            partial.createdAssetIds = [confirmedMediaAssetId];
            await atOwnerStep('ledger_asset', () => writeCleanupLedger(ledgerPath, partial));
            ownerExpected = {
              ownerId: scenario.owner.id, sightingId: scenario.ownerSightingId, mediaId: confirmedMediaId,
              jobId: ownerReservation.jobId, mediaAssetId: confirmedMediaAssetId, sha256: jpeg.sha256,
              byteLength: jpeg.bytes.byteLength, width: jpeg.width, height: jpeg.height,
            };
            ownerBaseline = await atOwnerStep('inspect', () => inspection.inspectMedia(ownerExpected!, signal));
            requireOwnerStep('inspect',
              ownerBaseline.jobCount === 1 && ownerBaseline.matchingFinalizedJobCount === 1 &&
              ownerBaseline.assetCount === 1 && ownerBaseline.matchingQuarantinedAssetCount === 1 &&
              ownerBaseline.stagingObjectExists);
            const repeated = await atOwnerStep('replay', () => finalizeMedia(scenario.owner, {
              sightingId: scenario.ownerSightingId, mediaId: confirmedMediaId, sha256: jpeg.sha256,
            }, env, { signal: signal, timeoutMs: env.finalizeTimeoutMs }));
            requireOwnerStep('replay', repeated.ok && repeated.mediaAssetId === confirmedMediaAssetId);
            requireOwnerStep('verify', await atOwnerStep('verify', unchanged));
            return true;
          },
          verifyMediaStaging: async (expected) => {
            requireMediaStep('prerequisite_state', Boolean(ownerReservation && ownerBaseline));
            const bucketConfigured = await atMediaStep('bucket_configuration', async () => {
              const { data, error } = await admin.storage.listBuckets();
              const bucket = Array.isArray(data)
                ? data.find((candidate) => candidate.name === expected.bucket)
                : undefined;
              return !error && bucket?.public === false && bucket.file_size_limit === expected.fileSizeLimit &&
                JSON.stringify(bucket.allowed_mime_types) === JSON.stringify(expected.allowedMimeTypes);
            });
            requireMediaStep('bucket_configuration', bucketConfigured);
            strangerReservation = await atMediaStep('stranger_reservation', () => reserveMedia(
              scenario.stranger,
              reservationInput(scenario.strangerSightingId, mediaId!, jpeg.sha256, jpeg.bytes.byteLength),
              env,
              { signal: signal, timeoutMs: env.finalizeTimeoutMs },
            ));
            partial.createdJobIds = [...(tracked.createdJobIds ?? []), strangerReservation.jobId];
            partial.createdObjectPaths = [...(tracked.createdObjectPaths ?? []), strangerReservation.path];
            await atMediaStep('stranger_reservation', () => writeCleanupLedger(ledgerPath, partial));
            const unknownPath = `jobs/${randomUUID()}.jpg`;
            for (const token of [null, scenario.owner.accessToken, scenario.stranger.accessToken]) {
              const actual = await withoutIsolationMutation(
                () => readFailure(token, ownerReservation!.path), [], 'privacy_read_actual',
              );
              requireMediaStep('isolation_compare', actual.unchanged);
              const unknown = await withoutIsolationMutation(
                () => readFailure(token, unknownPath), [], 'privacy_read_unknown',
              );
              requireMediaStep('isolation_compare', unknown.unchanged);
              requireMediaStep('privacy_read_equivalence', sameDeniedStorageFailure(actual.result, unknown.result));
              const listed = await withoutIsolationMutation(
                () => listHides(token, ownerReservation!.path), [], 'privacy_list',
              );
              requireMediaStep('isolation_compare', listed.unchanged);
              requireMediaStep('privacy_list', listed.result);
              requireMediaStep('owner_unchanged', await atMediaStep('owner_unchanged', unchanged));
            }
            return true;
          },
          verifyCrossOwnerIsolation: async () => {
            if (!ownerReservation || !strangerReservation || !ownerExpected || !ownerBaseline || !mediaId || !mediaAssetId) {
              return false;
            }
            const confirmedMediaId = mediaId;
            const confirmedMediaAssetId = mediaAssetId;
            const strangerAgainstOwner = reservationInput(
              scenario.ownerSightingId, confirmedMediaId, jpeg.sha256, jpeg.bytes.byteLength,
            );
            const reserveActual = await withoutIsolationMutation(
              () => reserveFailure(scenario.stranger, strangerAgainstOwner, env, signal),
            );
            if (!reserveActual.unchanged) return false;
            const reserveProbeMediaId = randomUUID();
            partial.createdMediaIds = [...(await persistCleanupMediaId(
              ledgerPath, partial, reserveProbeMediaId,
            )).createdMediaIds];
            const reserveUnknown = await withoutIsolationMutation(() => reserveFailure(scenario.stranger, {
              ...strangerAgainstOwner, sightingId: randomUUID(), mediaId: reserveProbeMediaId,
            }, env, signal), [reserveProbeMediaId]);
            if (!reserveUnknown.unchanged || !sameFailure(reserveActual.result, reserveUnknown.result)) return false;

            const finalizeActual = await withoutIsolationMutation(async () => failedResult(await finalizeMedia(
              scenario.stranger,
              { sightingId: scenario.ownerSightingId, mediaId: confirmedMediaId, sha256: jpeg.sha256 },
              env,
              { signal: signal, timeoutMs: env.finalizeTimeoutMs },
            )));
            if (!finalizeActual.unchanged) return false;
            const finalizeProbeMediaId = randomUUID();
            partial.createdMediaIds = [...(await persistCleanupMediaId(
              ledgerPath, partial, finalizeProbeMediaId,
            )).createdMediaIds];
            const finalizeUnknown = await withoutIsolationMutation(async () => failedResult(await finalizeMedia(
              scenario.stranger,
              { sightingId: randomUUID(), mediaId: finalizeProbeMediaId, sha256: jpeg.sha256 },
              env,
              { signal: signal, timeoutMs: env.finalizeTimeoutMs },
            )), [finalizeProbeMediaId]);
            if (!finalizeUnknown.unchanged || !sameFailure(finalizeActual.result, finalizeUnknown.result)) return false;

            const deleteActual = await withoutIsolationMutation(
              async () => failedResult(await deleteMedia(scenario.stranger, confirmedMediaAssetId, env, {
                signal: signal, timeoutMs: env.finalizeTimeoutMs,
              })),
            );
            if (!deleteActual.unchanged) return false;
            const deleteUnknown = await withoutIsolationMutation(
              async () => failedResult(await deleteMedia(scenario.stranger, randomUUID(), env, {
                signal: signal, timeoutMs: env.finalizeTimeoutMs,
              })),
            );
            return deleteUnknown.unchanged && sameFailure(deleteActual.result, deleteUnknown.result) && await unchanged();
          },
        };
        try {
          return await runHostedChecks(env, adapter);
        } finally {
          await inspection.close();
        }
      },
      });
    } catch (error) {
      const control = hostedGateControlFromError(error);
      const diagnosticPath = process.env.PILOT_GATE_2B_CHECK_DIAGNOSTIC_PATH;
      if (control !== undefined && typeof diagnosticPath === 'string') {
        await writeHostedCheckDiagnostic(diagnosticPath, control).catch(() => undefined);
      }
      throw error;
    }
    await writeChecksMarker(checksPath, result.checks);
    expect(result).toEqual({ checks: {
      authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
      syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
    } });
    process.stdout.write('hosted_gate_2b_passed\n');
  }, 240_000);
});
