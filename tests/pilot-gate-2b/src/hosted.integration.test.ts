import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  deleteMedia, finalizeMedia, putSignedMedia, reserveMedia, type ActorResult, type Reservation, type ReserveInput,
} from '../../pilot-gate-2a/src/actors.js';
import { deterministicJpegFixture } from '../../pilot-gate-2a/src/jpeg-fixture.js';
import { fetchWithTimeout } from '../../pilot-gate-2a/src/network.js';
import { runHostedChecks, type HostedCheckAdapter } from './checks.js';
import { writeHostedCheckDiagnostic } from './check-diagnostic.js';
import { persistCleanupMediaId, removeCleanupLedger, writeCleanupLedger } from './cleanup-ledger.js';
import { readHostedGateEnvironment, type HostedGateEnvironment } from './environment.js';
import { executeHostedGate, hostedGateControlFromError, type MutableHostedScenario } from './execute.js';
import { createHostedScenario, type HostedFixtureProgress, type HostedScenario } from './fixtures.js';
import {
  cleanupHostedScenario, inspectHostedIsolationState, inspectHostedMedia,
  type HostedInspection, type HostedInspectionInput, type HostedIsolationInspection,
  type PartialHostedScenario,
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
type RuntimeScenario = Readonly<{ fixture: HostedScenario; tracked: CleanupLedger }>;
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

async function reserveFailure(actor: HostedScenario['owner'], input: ReserveInput, env: HostedGateEnvironment) {
  try {
    await reserveMedia(actor, input, env);
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
    const partial: CleanupLedger = {
      createdAuthRecoveryIds: [], createdUserIds: [], sightingRecoveryReferences: [],
      createdSightingIds: [], createdMediaIds: [],
      createdJobIds: [], createdAssetIds: [], createdObjectPaths: [],
    };

    let result;
    try {
      result = await executeHostedGate({
      timeoutMs: 100_000,
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
        const fixture = await createHostedScenario(env, undefined, persistFixtureProgress);
        partial.createdUserIds = [...fixture.createdUserIds];
        partial.createdSightingIds = [fixture.ownerSightingId, fixture.strangerSightingId];
        Object.assign(ledger, partial);
        await writeCleanupLedger(ledgerPath, partial);
        return { fixture, tracked: partial } satisfies RuntimeScenario;
      },
      runChecks: async (value, signal) => {
        const { fixture: scenario, tracked } = value as RuntimeScenario;
        let ownerReservation: Reservation | undefined;
        let ownerExpected: HostedInspectionInput | undefined;
        let ownerBaseline: HostedInspection | undefined;
        let strangerReservation: Reservation | undefined;
        let mediaAssetId: string | undefined;
        let mediaId: string | undefined;
        const jpeg = deterministicJpegFixture();
        const admin = createClient(env.apiUrl, env.serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
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
          sameInspection(await inspectHostedMedia(env, ownerExpected!), ownerBaseline!);
        const isolationSnapshot = async (additionalMediaIds: readonly string[] = []) => {
          if (!ownerReservation || !strangerReservation || !mediaId) throw new Error('hosted_checks_failed');
          return await inspectHostedIsolationState(env, {
            ownerId: scenario.owner.id,
            strangerId: scenario.stranger.id,
            ownerSightingId: scenario.ownerSightingId,
            strangerSightingId: scenario.strangerSightingId,
            mediaIds: [...new Set([mediaId, ...additionalMediaIds])],
            observedObjectPaths: [ownerReservation.path, strangerReservation.path],
          });
        };
        const withoutIsolationMutation = async <T>(
          operation: () => Promise<T>,
          additionalMediaIds: readonly string[] = [],
        ): Promise<Readonly<{ result: T; unchanged: boolean }>> => {
          const before = await isolationSnapshot(additionalMediaIds);
          const result = await operation();
          const after = await isolationSnapshot(additionalMediaIds);
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
            mediaId = randomUUID();
            partial.createdMediaIds = [mediaId];
            await writeCleanupLedger(ledgerPath, partial);
            ownerReservation = await reserveMedia(
              scenario.owner,
              reservationInput(scenario.ownerSightingId, mediaId, jpeg.sha256, jpeg.bytes.byteLength),
              env,
            );
            partial.createdJobIds = [ownerReservation.jobId];
            partial.createdObjectPaths = [ownerReservation.path];
            await writeCleanupLedger(ledgerPath, partial);
            if (!(await putSignedMedia(ownerReservation, jpeg.bytes)).ok) return false;
            const finalized = await finalizeMedia(scenario.owner, {
              sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
            }, env);
            if (!finalized.ok || !finalized.mediaAssetId) return false;
            mediaAssetId = finalized.mediaAssetId;
            partial.createdAssetIds = [mediaAssetId];
            await writeCleanupLedger(ledgerPath, partial);
            ownerExpected = {
              ownerId: scenario.owner.id, sightingId: scenario.ownerSightingId, mediaId,
              jobId: ownerReservation.jobId, mediaAssetId, sha256: jpeg.sha256,
              byteLength: jpeg.bytes.byteLength, width: jpeg.width, height: jpeg.height,
            };
            ownerBaseline = await inspectHostedMedia(env, ownerExpected);
            const repeated = await finalizeMedia(scenario.owner, {
              sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
            }, env);
            return ownerBaseline.jobCount === 1 && ownerBaseline.matchingFinalizedJobCount === 1 &&
              ownerBaseline.assetCount === 1 && ownerBaseline.matchingQuarantinedAssetCount === 1 &&
              ownerBaseline.stagingObjectExists && repeated.ok && repeated.mediaAssetId === mediaAssetId &&
              await unchanged();
          },
          verifyMediaStaging: async (expected) => {
            if (!ownerReservation || !ownerBaseline) return false;
            const { data, error } = await admin.storage.listBuckets();
            const bucket = data?.find((candidate) => candidate.name === expected.bucket);
            if (error || bucket?.public !== false || bucket.file_size_limit !== expected.fileSizeLimit ||
                JSON.stringify(bucket.allowed_mime_types) !== JSON.stringify(expected.allowedMimeTypes)) return false;
            strangerReservation = await reserveMedia(scenario.stranger, reservationInput(
              scenario.strangerSightingId, mediaId!, jpeg.sha256, jpeg.bytes.byteLength,
            ), env);
            partial.createdJobIds = [...(tracked.createdJobIds ?? []), strangerReservation.jobId];
            partial.createdObjectPaths = [...(tracked.createdObjectPaths ?? []), strangerReservation.path];
            await writeCleanupLedger(ledgerPath, partial);
            const unknownPath = `jobs/${randomUUID()}.jpg`;
            for (const token of [null, scenario.owner.accessToken, scenario.stranger.accessToken]) {
              const actual = await withoutIsolationMutation(() => readFailure(token, ownerReservation!.path));
              if (!actual.unchanged) return false;
              const unknown = await withoutIsolationMutation(() => readFailure(token, unknownPath));
              if (!unknown.unchanged || !sameDeniedStorageFailure(actual.result, unknown.result)) return false;
              const listed = await withoutIsolationMutation(() => listHides(token, ownerReservation!.path));
              if (!listed.unchanged || !listed.result || !await unchanged()) return false;
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
              () => reserveFailure(scenario.stranger, strangerAgainstOwner, env),
            );
            if (!reserveActual.unchanged) return false;
            const reserveProbeMediaId = randomUUID();
            partial.createdMediaIds = [...(await persistCleanupMediaId(
              ledgerPath, partial, reserveProbeMediaId,
            )).createdMediaIds];
            const reserveUnknown = await withoutIsolationMutation(() => reserveFailure(scenario.stranger, {
              ...strangerAgainstOwner, sightingId: randomUUID(), mediaId: reserveProbeMediaId,
            }, env), [reserveProbeMediaId]);
            if (!reserveUnknown.unchanged || !sameFailure(reserveActual.result, reserveUnknown.result)) return false;

            const finalizeActual = await withoutIsolationMutation(async () => failedResult(await finalizeMedia(
              scenario.stranger,
              { sightingId: scenario.ownerSightingId, mediaId: confirmedMediaId, sha256: jpeg.sha256 },
              env,
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
            )), [finalizeProbeMediaId]);
            if (!finalizeUnknown.unchanged || !sameFailure(finalizeActual.result, finalizeUnknown.result)) return false;

            const deleteActual = await withoutIsolationMutation(
              async () => failedResult(await deleteMedia(scenario.stranger, confirmedMediaAssetId, env)),
            );
            if (!deleteActual.unchanged) return false;
            const deleteUnknown = await withoutIsolationMutation(
              async () => failedResult(await deleteMedia(scenario.stranger, randomUUID(), env)),
            );
            return deleteUnknown.unchanged && sameFailure(deleteActual.result, deleteUnknown.result) && await unchanged();
          },
        };
        return await runHostedChecks(env, adapter);
      },
      cleanup: async (value) => {
        const tracked = value && typeof value === 'object' && 'tracked' in value
          ? (value as RuntimeScenario).tracked
          : value as PartialHostedScenario;
        await cleanupHostedScenario(env, tracked);
      },
      emitEvidence: async () => { await removeCleanupLedger(ledgerPath); },
      });
    } catch (error) {
      const control = hostedGateControlFromError(error);
      const diagnosticPath = process.env.PILOT_GATE_2B_CHECK_DIAGNOSTIC_PATH;
      if (control !== undefined && typeof diagnosticPath === 'string') {
        await writeHostedCheckDiagnostic(diagnosticPath, control).catch(() => undefined);
      }
      throw error;
    }
    expect(result).toMatchObject({ cleanupPassed: true });
    process.stdout.write('hosted_gate_2b_passed\n');
  }, 120_000);
});
