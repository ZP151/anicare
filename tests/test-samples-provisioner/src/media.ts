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
/** Some fixture encoders omit APP0. Add only the minimal JFIF container header;
 * compressed pixels are unchanged. The full production decoder still validates
 * the result. Existing headers/metadata and malformed inputs are never repaired. */
export function prepareFixtureJpeg(bytes:Uint8Array):Uint8Array{
 if(bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff||bytes[3]!==0xdb)return bytes;
 const jfif=Uint8Array.from([0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0]);
 const result=new Uint8Array(bytes.length+jfif.length);
 result.set(bytes.subarray(0,2));result.set(jfif,2);result.set(bytes.subarray(2),2+jfif.length);
 return result;
}
