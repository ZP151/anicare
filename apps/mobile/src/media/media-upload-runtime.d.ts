export type MediaUploadRuntimeResult =
  | 'upload_pending' | 'uploading' | 'finalizing' | 'waiting' | 'needs_user' | 'quarantined'
  | 'stale' | 'not_ready' | 'unavailable';
export function uploadDraftMediaNow(draftId: string): Promise<MediaUploadRuntimeResult>;
export function retryRecoverableMediaDrafts(): Promise<MediaUploadRuntimeResult[]>;
