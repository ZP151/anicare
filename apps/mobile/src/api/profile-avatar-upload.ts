import { File } from 'expo-file-system';

import { getSupabaseClient } from './supabase';
import type { RenderedMedia } from '../media/contracts';

type EdgeClient = Readonly<{ auth: Readonly<{ getSession(): PromiseLike<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }> }>; functions: Readonly<{ invoke(name: 'profile-avatar-upload', options: Readonly<{ body: unknown; headers: Record<string,string> }>): PromiseLike<{ data: unknown; error: unknown }> }> }>;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validUpload(value: unknown, jobId: string, expectedOrigin: string): value is { signedUrl: string; token: string } {
  if (!record(value) || typeof value.signedUrl !== 'string' || typeof value.token !== 'string' || !value.token) return false;
  try { const url = new URL(value.signedUrl); const origin = new URL(expectedOrigin); return origin.protocol==='https:' && url.protocol==='https:' && url.origin===origin.origin && !url.username && !url.password && !url.hash && url.pathname===`/storage/v1/object/upload/sign/profile-avatars/avatars/${jobId}.jpg` && url.search===`?token=${encodeURIComponent(value.token)}`; } catch { return false; }
}

/** Uploads only the already-rasterized JPEG. Source camera/library bytes never leave the device. */
export async function uploadProfileAvatar(artifact: RenderedMedia, client: EdgeClient | null = getSupabaseClient() as unknown as EdgeClient | null, isCurrent: () => Promise<boolean> = async () => true): Promise<string> {
  if (!client || artifact.mimeType !== 'image/jpeg' || artifact.byteLength < 1 || artifact.byteLength > 2 * 1024 * 1024 || artifact.width > 512 || artifact.height > 512) throw new Error('invalid_avatar');
  if (!await isCurrent()) throw new Error('stale_account');
  const auth = await client.auth.getSession();
  if (auth.error || !auth.data.session || !await isCurrent()) throw new Error('stale_account');
  const headers = { Authorization: `Bearer ${auth.data.session.access_token}` };
  const reserve = await client.functions.invoke('profile-avatar-upload', { headers, body: { action: 'reserve', sha256: artifact.sha256, byteLength: artifact.byteLength, width: artifact.width, height: artifact.height } });
  if (!await isCurrent()) throw new Error('stale_account');
  if (reserve.error || !record(reserve.data) || typeof reserve.data.jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reserve.data.jobId) || typeof reserve.data.reservationExpiresAt !== 'string' || !Number.isFinite(Date.parse(reserve.data.reservationExpiresAt)) || Date.parse(reserve.data.reservationExpiresAt) <= Date.now() || Date.parse(reserve.data.reservationExpiresAt) > Date.now()+15*60_000 || !validUpload(reserve.data.upload,reserve.data.jobId,process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')) throw new Error('avatar_unavailable');
  const bytes = await new File(artifact.uri).bytes();
  if (bytes.byteLength !== artifact.byteLength) throw new Error('avatar_changed');
  if (!await isCurrent()) throw new Error('stale_account');
  const response = await fetch(reserve.data.upload.signedUrl, { method: 'PUT', headers: { authorization: `Bearer ${reserve.data.upload.token}`, 'content-type': 'image/jpeg', 'x-upsert': 'false' }, body: bytes, redirect: 'error' });
  if (!await isCurrent()) throw new Error('stale_account');
  if (!response.ok) throw new Error('avatar_upload_failed');
  const finalization = await client.functions.invoke('profile-avatar-upload', { headers, body: { action: 'finalize', jobId: reserve.data.jobId } });
  if (!await isCurrent()) throw new Error('stale_account');
  if (finalization.error || !record(finalization.data) || finalization.data.avatarPath !== `avatars/${reserve.data.jobId}.jpg`) throw new Error('avatar_upload_failed');
  return finalization.data.avatarPath;
}
