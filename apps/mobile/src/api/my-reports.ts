import { getSupabaseClient } from './supabase';

export type MyReportSummary = Readonly<{
  sightingId: string;
  occurredAt: string;
  createdAt: string;
  reportState: 'private_review' | 'delayed' | 'published' | 'archived';
  mediaState: 'none' | 'pending' | 'quarantined' | 'cleanup_pending' | 'removed';
  identityState: 'not_requested' | 'pending_review' | 'linked' | 'closed';
}>;

export type MyReportsCursor = Readonly<{ createdAt: string; sightingId: string }>;
export type MyReportsPage = Readonly<{ items: readonly MyReportSummary[]; nextCursor: MyReportsCursor | null }>;

export type NarrowRpcClient = Readonly<{
  rpc: (
    functionName: 'list_my_sighting_summaries',
    arguments_: Readonly<{
      p_limit: number;
      p_before_created_at: string | null;
      p_before_sighting_id: string | null;
    }>,
  ) => PromiseLike<Readonly<{ data: unknown; error: unknown | null }>>;
}>;

const MAX_ROWS = 50;
const MAX_RESPONSE_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const REPORT_STATES = new Set<MyReportSummary['reportState']>(['private_review', 'delayed', 'published', 'archived']);
const MEDIA_STATES = new Set<MyReportSummary['mediaState']>(['none', 'pending', 'quarantined', 'cleanup_pending', 'removed']);
const IDENTITY_STATES = new Set<MyReportSummary['identityState']>(['not_requested', 'pending_review', 'linked', 'closed']);
const SUMMARY_KEYS = ['sightingId', 'occurredAt', 'createdAt', 'reportState', 'mediaState', 'identityState'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: unknown): value is Record<(typeof SUMMARY_KEYS)[number], unknown> {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === SUMMARY_KEYS.length && SUMMARY_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false;
  const match = TIMESTAMP.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]! &&
    hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(new Date(value).getTime());
}

function responseIsWithinLimit(value: unknown): boolean {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' && new TextEncoder().encode(json).byteLength <= MAX_RESPONSE_BYTES;
  } catch {
    return false;
  }
}

function parseSummary(value: unknown): MyReportSummary {
  if (!hasExactKeys(value) ||
      typeof value.sightingId !== 'string' || !UUID.test(value.sightingId) ||
      !isTimestamp(value.occurredAt) || !isTimestamp(value.createdAt) ||
      typeof value.reportState !== 'string' || !REPORT_STATES.has(value.reportState as MyReportSummary['reportState']) ||
      typeof value.mediaState !== 'string' || !MEDIA_STATES.has(value.mediaState as MyReportSummary['mediaState']) ||
      typeof value.identityState !== 'string' || !IDENTITY_STATES.has(value.identityState as MyReportSummary['identityState'])) {
    throw new Error('invalid_my_reports_response');
  }
  return value as MyReportSummary;
}

export function parseMyReports(value: unknown): MyReportsPage {
  if (!Array.isArray(value) || value.length > MAX_ROWS || !responseIsWithinLimit(value)) {
    throw new Error('invalid_my_reports_response');
  }
  const items = value.map(parseSummary);
  const last = items.at(-1);
  return {
    items,
    nextCursor: last ? { createdAt: last.createdAt, sightingId: last.sightingId } : null,
  };
}

function pageLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || !Number.isInteger(limit)) return MAX_ROWS;
  return Math.min(MAX_ROWS, Math.max(1, limit));
}

function cursorArguments(cursor: MyReportsCursor | null | undefined): Readonly<{
  p_before_created_at: string | null;
  p_before_sighting_id: string | null;
}> {
  if (!cursor) return { p_before_created_at: null, p_before_sighting_id: null };
  if (!isTimestamp(cursor.createdAt) || !UUID.test(cursor.sightingId)) {
    throw new Error('invalid_my_reports_response');
  }
  return { p_before_created_at: cursor.createdAt, p_before_sighting_id: cursor.sightingId };
}

export async function listMyReports(
  input: Readonly<{ limit?: number; cursor?: MyReportsCursor | null }> = {},
  client: NarrowRpcClient | null = getSupabaseClient() as unknown as NarrowRpcClient | null,
): Promise<MyReportsPage> {
  if (!client) throw new Error('my_reports_unavailable');
  try {
    const result = await client.rpc('list_my_sighting_summaries', {
      p_limit: pageLimit(input.limit),
      ...cursorArguments(input.cursor),
    });
    if (result.error) throw new Error('rpc_failed');
    return parseMyReports(result.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_my_reports_response') throw error;
    throw new Error('my_reports_unavailable');
  }
}
