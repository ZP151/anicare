import { createClient } from '@supabase/supabase-js';

import { COMMUNITY_MEDIA_BUCKET, createCommunityMediaHandler } from '../_shared/community-media-handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigin = Deno.env.get('MEDIA_ALLOWED_ORIGIN') ?? null;
const service = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

Deno.serve(createCommunityMediaHandler({
  allowedOrigin,
  serviceAvailable: service !== null,
  authenticate: async accessToken => {
    if (!service) return null;
    const { data, error } = await service.auth.getUser(accessToken);
    return error || !data.user ? null : data.user.id;
  },
  reserve: async (ownerId, input) => {
    if (!service) return null;
    const { data, error } = await service.rpc('reserve_community_media_upload', {
      p_owner_id: ownerId, p_request_id: input.requestId,
      p_thumb_sha256: input.thumb.sha256, p_thumb_byte_length: input.thumb.byteLength, p_thumb_width: input.thumb.width, p_thumb_height: input.thumb.height,
      p_display_sha256: input.display.sha256, p_display_byte_length: input.display.byteLength, p_display_width: input.display.width, p_display_height: input.display.height,
    }).maybeSingle();
    if (error || !data || typeof data.job_id !== 'string' || typeof data.reservation_expires_at !== 'string' || typeof data.thumb_path !== 'string' || typeof data.display_path !== 'string') return null;
    return { jobId: data.job_id, reservationExpiresAt: data.reservation_expires_at, thumbPath: data.thumb_path, displayPath: data.display_path };
  },
  createSignedUpload: async path => {
    if (!service) return null;
    const { data, error } = await service.storage.from(COMMUNITY_MEDIA_BUCKET).createSignedUploadUrl(path, { upsert: false });
    return error || !data?.signedUrl || !data.token ? null : { signedUrl: data.signedUrl, token: data.token };
  },
  getJob: async (ownerId, jobId) => {
    if (!service) return null;
    const { data, error } = await service.rpc('get_community_media_upload_job', { p_owner_id: ownerId, p_job_id: jobId }).maybeSingle();
    if (error || !data || !['reserved', 'finalized', 'attached', 'deletion_pending', 'completed'].includes(data.status) || typeof data.reservation_expires_at !== 'string') return null;
    const variant = (prefix: 'thumb' | 'display') => typeof data[`${prefix}_path`] === 'string' && typeof data[`${prefix}_sha256`] === 'string' && Number.isInteger(data[`${prefix}_byte_length`]) && Number.isInteger(data[`${prefix}_width`]) && Number.isInteger(data[`${prefix}_height`]) ? { path: data[`${prefix}_path`] as string, sha256: data[`${prefix}_sha256`] as string, byteLength: data[`${prefix}_byte_length`] as number, width: data[`${prefix}_width`] as number, height: data[`${prefix}_height`] as number } : null;
    const thumb = variant('thumb'); const display = variant('display');
    return !thumb || !display ? null : { status: data.status, reservationExpiresAt: data.reservation_expires_at, thumb, display };
  },
  download: async path => {
    if (!service) return null;
    const { data, error } = await service.storage.from(COMMUNITY_MEDIA_BUCKET).download(path);
    return error ? null : data;
  },
  finalize: async (ownerId, jobId) => {
    if (!service) return null;
    const { data, error } = await service.rpc('finalize_community_media_upload', { p_owner_id: ownerId, p_job_id: jobId });
    return error || typeof data !== 'string' ? null : data;
  },
  resolve: async (postId, mediaId, variant, actorId) => {
    if (!service) return null;
    const { data, error } = await service.rpc('resolve_public_community_media', { p_post_id: postId, p_media_id: mediaId, p_variant: variant, p_actor: actorId });
    return error || typeof data !== 'string' ? null : data;
  },
}));
