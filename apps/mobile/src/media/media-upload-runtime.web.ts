export type MediaUploadRuntimeResult = 'unavailable';

/** Expo web has no secure artifact reader, signed PUT, or upload recovery path. */
export async function uploadDraftMediaNow(_draftId: string, _signal?: AbortSignal): Promise<MediaUploadRuntimeResult> {
  return 'unavailable';
}

export async function retryRecoverableMediaDrafts(_signal?: AbortSignal): Promise<MediaUploadRuntimeResult[]> {
  return [];
}
