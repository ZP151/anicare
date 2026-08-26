import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { encryptPreciseLocation } from '../_shared/encryption.ts';
import { prepareSightingRecord } from '../_shared/sighting-policy.ts';

const requestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  occurredAt: z.iso.datetime({ offset: true }),
  risk: z.enum(['normal', 'sensitive', 'critical']).default('normal'),
  traits: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(2000).nullable().default(null),
  clientDedupeKey: z.string().min(8).max(160),
});

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

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: 'authentication_required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('PRECISE_LOCATION_ENCRYPTION_KEY');
  if (!supabaseUrl || !serviceRoleKey || !encryptionKey) {
    console.error('create-sighting is missing required server configuration');
    return json({ error: 'service_unavailable' }, 503);
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await request.json());
  } catch (error) {
    return json(
      { error: 'invalid_request', issues: error instanceof z.ZodError ? error.issues : [] },
      400,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'authentication_required' }, 401);

  const keyBytes = decodeBase64Key(encryptionKey);
  if (keyBytes.byteLength !== 32) {
    console.error('PRECISE_LOCATION_ENCRYPTION_KEY must decode to 32 bytes');
    return json({ error: 'service_unavailable' }, 503);
  }

  const publicRecord = prepareSightingRecord(payload);
  const encrypted = await encryptPreciseLocation(
    { latitude: payload.latitude, longitude: payload.longitude },
    keyBytes,
  );
  const requestId = crypto.randomUUID();

  const { data: sightingId, error: insertError } = await admin.rpc(
    'create_sighting_with_location',
    {
      p_reporter_id: userData.user.id,
      p_occurred_at: payload.occurredAt,
      p_public_cell_id: publicRecord.publicCellId,
      p_time_bucket: publicRecord.timeBucket,
      p_risk: payload.risk,
      p_visibility: publicRecord.visibility,
      p_visible_at: publicRecord.visibleAt,
      p_traits: payload.traits,
      p_notes: payload.notes,
      p_client_dedupe_key: payload.clientDedupeKey,
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

  return json(
    {
      sightingId,
      publicCellId: publicRecord.publicCellId,
      visibility: publicRecord.visibility,
      visibleAt: publicRecord.visibleAt,
      requestId,
    },
    201,
  );
});

