import {createHash} from 'node:crypto';
import {inspectJpeg} from '../../../supabase/functions/_shared/jpeg-policy.js';

export type CommunityMediaVariant = Readonly<{bytes: Uint8Array; sha256: string; width: number; height: number}>;

function validateVariant(bytes: Uint8Array, maxBytes: number, maxDimension: number): CommunityMediaVariant {
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) throw new Error('test_sample_community_media_invalid');
  try {
    const {width, height} = inspectJpeg(bytes);
    if (width > maxDimension || height > maxDimension) throw new Error('test_sample_community_media_invalid');
    return {bytes: Uint8Array.from(bytes), sha256: createHash('sha256').update(bytes).digest('hex'), width, height};
  } catch {
    throw new Error('test_sample_community_media_invalid');
  }
}

/** Validates prebuilt display/thumb fixture files against the exact production JPEG policy. */
export async function validateCommunityMediaVariants(displayBytes: Uint8Array, thumbBytes: Uint8Array): Promise<Readonly<{display: CommunityMediaVariant; thumb: CommunityMediaVariant}>> {
  return {display: validateVariant(displayBytes, 4 * 1024 * 1024, 2048), thumb: validateVariant(thumbBytes, 512 * 1024, 480)};
}