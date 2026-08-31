import { createClient } from '@supabase/supabase-js';

import { encryptPreciseLocation } from '../_shared/encryption.ts';
import { prepareSightingRecord } from '../_shared/sighting-policy.ts';
import {
  executeSightingSubmission,
  ownedStoredSightingSubmission,
  parseSightingSubmission,
  readBoundedSightingSubmissionJson,
  strictBearerToken,
  toSightingSubmissionResponse,
} from '../_shared/sighting-submission.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeBase64Key(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toPostgresBytea(bytes: Uint8Array): string {
  return `\\x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'invalid_request' }, 415);
  }

  const token = strictBearerToken(request);
  if (!token) return json({ error: 'authentication_required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('create-sighting is missing required server configuration');
    return json({ error: 'service_unavailable' }, 503);
  }

  let payload: ReturnType<typeof parseSightingSubmission>;
  try {
    payload = parseSightingSubmission(await readBoundedSightingSubmissionJson(request));
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'authentication_required' }, 401);

  const requestId = crypto.randomUUID();
  return executeSightingSubmission(payload, {
    recover: async (recovery) => {
      const { data: stored, error: recoveryError } = await admin
        .from('sightings')
        .select('id, reporter_id, visibility, visible_at')
        .eq('reporter_id', userData.user.id)
        .eq('client_dedupe_key', recovery.clientDedupeKey)
        .maybeSingle();
      if (recoveryError) return json({ error: 'submission_failed', requestId }, 500);
      if (!stored) return json({ error: 'sighting_submission_not_found' }, 404);

      try {
        const owned = ownedStoredSightingSubmission(stored, userData.user.id);
        if (!owned) return json({ error: 'sighting_submission_not_found' }, 404);
        return json(toSightingSubmissionResponse(owned, requestId), 200);
      } catch {
        return json({ error: 'submission_failed', requestId }, 500);
      }
    },
    create: async (creation) => {
      const encryptionKey = Deno.env.get('PRECISE_LOCATION_ENCRYPTION_KEY');
      if (!encryptionKey) {
        console.error('create-sighting is missing required server configuration');
        return json({ error: 'service_unavailable' }, 503);
      }
      const keyBytes = decodeBase64Key(encryptionKey);
      if (keyBytes.byteLength !== 32) {
        console.error('PRECISE_LOCATION_ENCRYPTION_KEY must decode to 32 bytes');
        return json({ error: 'service_unavailable' }, 503);
      }

      const publicRecord = prepareSightingRecord(creation);
      const encrypted = await encryptPreciseLocation(
        { latitude: creation.latitude, longitude: creation.longitude },
        keyBytes,
      );

      const { data: sightingId, error: insertError } = await admin.rpc(
        'create_sighting_with_location',
        {
          p_reporter_id: userData.user.id,
          p_occurred_at: creation.occurredAt,
          p_public_cell_id: publicRecord.publicCellId,
          p_time_bucket: publicRecord.timeBucket,
          p_risk: creation.risk,
          p_visibility: publicRecord.visibility,
          p_visible_at: publicRecord.visibleAt,
          p_traits: creation.traits,
          p_notes: creation.notes,
          p_client_dedupe_key: creation.clientDedupeKey,
          p_ciphertext: toPostgresBytea(encrypted.ciphertext),
          p_nonce: toPostgresBytea(encrypted.nonce),
          p_request_id: requestId,
        },
      );

      if (insertError) {
        console.error('create_sighting_with_location failed', {
          requestId,
          code: insertError.code,
        });
        const conflict = insertError.code === '23505';
        return json({ error: conflict ? 'duplicate_submission' : 'submission_failed', requestId }, conflict ? 409 : 500);
      }

      const { data: stored, error: storedError } = await admin
        .from('sightings')
        .select('id, reporter_id, visibility, visible_at')
        .eq('id', sightingId)
        .eq('reporter_id', userData.user.id)
        .maybeSingle();
      if (storedError || !stored) return json({ error: 'submission_failed', requestId }, 500);

      try {
        const owned = ownedStoredSightingSubmission(stored, userData.user.id);
        if (!owned) return json({ error: 'submission_failed', requestId }, 500);
        return json(toSightingSubmissionResponse(owned, requestId), 201);
      } catch {
        return json({ error: 'submission_failed', requestId }, 500);
      }
    },
  });
});
