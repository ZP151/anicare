import { createHash } from 'node:crypto';

type PortraitStorage = {
  list(): Promise<{data:unknown;error:unknown}>;
  download(): Promise<{data:Blob|null;error:unknown}>;
  upload(): Promise<{error:unknown}>;
};

export async function ensurePortrait(storage: PortraitStorage, expectedSha: string) {
  // A successful listing distinguishes absence from a failed binary download.
  const listed = await storage.list();
  if (listed.error || !Array.isArray(listed.data) || listed.data.some(row => !row || typeof row.name !== 'string')) throw new Error('test_sample_portrait_list_failed');
  if (listed.data.some(row => row.name === 'portrait.jpg')) {
    const downloaded = await storage.download();
    if (downloaded.error || !downloaded.data) throw new Error('test_sample_portrait_download_failed');
    const actualSha = createHash('sha256').update(new Uint8Array(await downloaded.data.arrayBuffer())).digest('hex');
    if (actualSha !== expectedSha) throw new Error('test_sample_portrait_collision');
    return;
  }
  const uploaded = await storage.upload();
  if (uploaded.error) throw new Error('test_sample_portrait_upload_failed');
}
