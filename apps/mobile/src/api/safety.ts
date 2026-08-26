import { getSupabaseClient } from './supabase';
import type { NarrowRpcClient } from './feed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_TYPES = new Set(['sighting', 'user']);
const REASON_CODES = new Set([
  'spam',
  'harassment',
  'unsafe_location',
  'animal_welfare',
  'graphic_content',
  'misinformation',
  'precise_location_exposure',
  'animal_in_immediate_danger',
]);
const REPORT_KEYS = ['contentType', 'contentId', 'reasonCode', 'detail', 'requestId'] as const;

export type ModerationReportRequest = Readonly<{
  contentType: 'sighting' | 'user';
  contentId: string;
  reasonCode:
    | 'spam'
    | 'harassment'
    | 'unsafe_location'
    | 'animal_welfare'
    | 'graphic_content'
    | 'misinformation'
    | 'precise_location_exposure'
    | 'animal_in_immediate_danger';
  detail: string | null;
  requestId: string;
}>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function buildModerationReportRpcArgs(input: ModerationReportRequest): Readonly<{
  p_content_type: 'sighting' | 'user';
  p_content_id: string;
  p_reason_code: string;
  p_detail: string | null;
  p_request_id: string;
}> {
  if (!hasExactKeys(input, REPORT_KEYS) ||
      typeof input.contentType !== 'string' || !CONTENT_TYPES.has(input.contentType) ||
      !isUuid(input.contentId) || typeof input.reasonCode !== 'string' || !REASON_CODES.has(input.reasonCode) ||
      (input.detail !== null && (typeof input.detail !== 'string' || input.detail.trim().length < 1 || input.detail.length > 1000)) ||
      !isUuid(input.requestId)) {
    throw new Error('invalid_moderation_report_request');
  }
  return {
    p_content_type: input.contentType as 'sighting' | 'user',
    p_content_id: input.contentId,
    p_reason_code: input.reasonCode,
    p_detail: input.detail,
    p_request_id: input.requestId,
  };
}

function requireRpcClient(client?: NarrowRpcClient): NarrowRpcClient {
  const resolved = client ?? (getSupabaseClient() as unknown as NarrowRpcClient | null);
  if (!resolved) throw new Error('safety_unavailable');
  return resolved;
}

export async function reportContent(
  input: ModerationReportRequest,
  client?: NarrowRpcClient,
): Promise<string> {
  const { data, error } = await requireRpcClient(client).rpc(
    'create_moderation_report',
    buildModerationReportRpcArgs(input),
  );
  if (error) throw new Error('safety_request_failed');
  if (!isUuid(data)) throw new Error('invalid_moderation_report_response');
  return data;
}

function buildBlockRpcArgs(blockedId: string, requestId: string): Readonly<{
  p_blocked_id: string;
  p_request_id: string;
}> {
  if (!isUuid(blockedId) || !isUuid(requestId)) throw new Error('invalid_block_request');
  return { p_blocked_id: blockedId, p_request_id: requestId };
}

async function changeBlock(
  operation: 'block_user' | 'unblock_user',
  blockedId: string,
  requestId: string,
  client?: NarrowRpcClient,
): Promise<void> {
  const { data, error } = await requireRpcClient(client).rpc(operation, buildBlockRpcArgs(blockedId, requestId));
  if (error) throw new Error('safety_request_failed');
  if (data !== true) throw new Error('invalid_block_response');
}

export function blockUser(blockedId: string, requestId: string, client?: NarrowRpcClient): Promise<void> {
  return changeBlock('block_user', blockedId, requestId, client);
}

export function unblockUser(blockedId: string, requestId: string, client?: NarrowRpcClient): Promise<void> {
  return changeBlock('unblock_user', blockedId, requestId, client);
}
