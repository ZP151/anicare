import type { UploadJobState } from '../offline/upload-job';

export type MediaUploadRuntimeResult = UploadJobState | 'stale' | 'not_ready' | 'unavailable';
export function uploadDraftMediaNow(draftId: string): Promise<MediaUploadRuntimeResult>;
export function retryRecoverableMediaDrafts(): Promise<MediaUploadRuntimeResult[]>;
