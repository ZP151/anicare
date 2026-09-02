import type { UploadJobState } from '../offline/upload-job';

export type MediaUploadRuntimeResult = UploadJobState | 'stale' | 'not_ready' | 'unavailable';
export function uploadDraftMediaNow(draftId: string, signal?: AbortSignal, expectedOwnerSubject?: string): Promise<MediaUploadRuntimeResult>;
export function retryRecoverableMediaDrafts(signal?: AbortSignal): Promise<MediaUploadRuntimeResult[]>;
