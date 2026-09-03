import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  deleteMedia, finalizeMedia, putSignedMedia, reserveMedia, type Reservation, type ReserveInput,
} from '../../pilot-gate-2a/src/actors.js';
import { deterministicJpegFixture } from '../../pilot-gate-2a/src/jpeg-fixture.js';
import { fetchWithTimeout } from '../../pilot-gate-2a/src/network.js';
import { runHostedChecks, type HostedCheckAdapter } from './checks.js';
import { readHostedGateEnvironment } from './environment.js';
import { createHostedScenario } from './fixtures.js';
import { cleanupHostedScenario, inspectHostedMedia } from './inspection.js';

const DENIED = new Set([400, 401, 403, 404, 406]);

describe('real Hosted Gate 2B', () => {
  it('executes the fixed hosted media readiness scenario', async () => {
    const env = readHostedGateEnvironment(process.env);
    const scenario = await createHostedScenario(env);
    const tracked: {
      createdUserIds: string[]; createdSightingIds: string[]; createdMediaIds: string[];
      createdJobIds: string[]; createdAssetIds: string[]; createdObjectPaths: string[];
    } = {
      createdUserIds: [...scenario.createdUserIds],
      createdSightingIds: [scenario.ownerSightingId, scenario.strangerSightingId],
      createdMediaIds: [], createdJobIds: [], createdAssetIds: [], createdObjectPaths: [],
    };
    let ownerReservation: Reservation | undefined;
    let mediaAssetId: string | undefined;
    let mediaId: string | undefined;
    const jpeg = deterministicJpegFixture();
    const admin = createClient(env.apiUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const denyRead = async (accessToken: string | null, path: string): Promise<boolean> => {
      const bearer = accessToken ?? env.anonKey;
      const response = await fetchWithTimeout(`${env.apiUrl}${path}`, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { apikey: env.anonKey, Authorization: `Bearer ${bearer}` },
      }, 8_000);
      return !response.ok && DENIED.has(response.status);
    };

    const adapter: HostedCheckAdapter = {
      // The deployment orchestrator performs the authenticated PATCH + exact GET readback immediately before this harness.
      verifyAuthRedirects: async () => true,
      verifyMediaStaging: async (expected) => {
        const { data, error } = await admin.storage.listBuckets();
        const bucket = data?.find((candidate) => candidate.name === expected.bucket);
        return !error && bucket?.public === false && bucket.file_size_limit === expected.fileSizeLimit &&
          JSON.stringify(bucket.allowed_mime_types) === JSON.stringify(expected.allowedMimeTypes);
      },
      verifyPublicKeyOrigin: async (origin) => {
        const response = await fetchWithTimeout(`${origin}/auth/v1/settings`, {
          method: 'GET', redirect: 'error', cache: 'no-store', headers: { apikey: env.anonKey },
        }, 8_000);
        const body = new Uint8Array(await response.arrayBuffer());
        return response.ok && !response.redirected && response.url.startsWith(`${origin}/`) && body.byteLength <= 64 * 1024;
      },
      runOwnerHappyPath: async () => {
        mediaId = randomUUID();
        tracked.createdMediaIds = [mediaId];
        const receipt: ReserveInput = {
          sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
          byteLength: jpeg.bytes.byteLength,
          review: {
            recipeVersion: 'jpeg-srgb-2048-q88.v1',
            detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
            width: jpeg.width, height: jpeg.height, confirmedAtLocal: new Date().toISOString(),
          },
        };
        ownerReservation = await reserveMedia(scenario.owner, receipt, env);
        tracked.createdJobIds = [ownerReservation.jobId];
        tracked.createdObjectPaths = [ownerReservation.path];
        if (!(await putSignedMedia(ownerReservation, jpeg.bytes)).ok) return false;
        const finalized = await finalizeMedia(scenario.owner, {
          sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
        }, env);
        if (!finalized.ok || !finalized.mediaAssetId) return false;
        mediaAssetId = finalized.mediaAssetId;
        tracked.createdAssetIds = [mediaAssetId];
        const expected = {
          ownerId: scenario.owner.id, sightingId: scenario.ownerSightingId, mediaId,
          jobId: ownerReservation.jobId, mediaAssetId, sha256: jpeg.sha256,
          byteLength: jpeg.bytes.byteLength, width: jpeg.width, height: jpeg.height,
        };
        const inspection = await inspectHostedMedia(env, expected);
        const repeated = await finalizeMedia(scenario.owner, {
          sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
        }, env);
        return inspection.jobCount === 1 && inspection.matchingFinalizedJobCount === 1 &&
          inspection.assetCount === 1 && inspection.matchingQuarantinedAssetCount === 1 &&
          inspection.stagingObjectExists && repeated.ok && repeated.mediaAssetId === mediaAssetId;
      },
      verifyCrossOwnerIsolation: async () => {
        if (!ownerReservation || !mediaId || !mediaAssetId) return false;
        const strangerReceipt: ReserveInput = {
          sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
          byteLength: jpeg.bytes.byteLength,
          review: {
            recipeVersion: 'jpeg-srgb-2048-q88.v1',
            detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
            width: 1, height: 1, confirmedAtLocal: new Date().toISOString(),
          },
        };
        let reserveDenied = false;
        try {
          await reserveMedia(scenario.stranger, strangerReceipt, env);
        } catch (error) {
          reserveDenied = typeof error === 'object' && error !== null && 'status' in error && error.status === 403;
        }
        const finalize = await finalizeMedia(scenario.stranger, {
          sightingId: scenario.ownerSightingId, mediaId, sha256: jpeg.sha256,
        }, env);
        const deletion = await deleteMedia(scenario.stranger, mediaAssetId, env);
        const path = ownerReservation.path.split('/').map(encodeURIComponent).join('/');
        return reserveDenied && !finalize.ok && finalize.status === 403 && !deletion.ok && deletion.status === 403 &&
          await denyRead(null, `/storage/v1/object/media-staging/${path}`) &&
          await denyRead(scenario.stranger.accessToken, `/storage/v1/object/media-staging/${path}`);
      },
    };

    try {
      await expect(runHostedChecks(env, adapter)).resolves.toEqual({
        authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
        syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
      });
    } finally {
      await cleanupHostedScenario(env, tracked);
    }
    process.stdout.write('hosted_gate_2b_passed\n');
  }, 120_000);
});
