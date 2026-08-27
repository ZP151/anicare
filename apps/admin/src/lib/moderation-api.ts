import 'server-only';

export type ModerationAction = 'hide_sighting' | 'restore_sighting' | 'no_action';
export type ModerationRisk = 'normal' | 'sensitive' | 'critical';
export type ModerationStatus = 'open' | 'auto_hidden' | 'under_review' | 'resolved' | 'appealed' | 'closed';
export type SightingVisibility = 'limited' | 'public' | 'hidden' | 'archived';

export interface NarrowRpcClient {
  rpc(functionName: string, parameters?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export type AdminModerationQueueItem = Readonly<{
  reportId: string;
  contentType: 'sighting';
  reasonCode: string;
  risk: ModerationRisk;
  status: ModerationStatus;
  dueAt: string;
}>;

export type AdminModerationReport = AdminModerationQueueItem & Readonly<{
  createdAt: string;
}>;

export type ModerationResolution = Readonly<{
  reportId: string;
  action: ModerationAction;
  rationale: string;
}>;

export type ModerationResolutionResult = Readonly<{
  reportId: string;
  action: ModerationAction;
  status: 'resolved';
  visibility: SightingVisibility;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const RISKS = new Set<ModerationRisk>(['normal', 'sensitive', 'critical']);
const STATUSES = new Set<ModerationStatus>(['open', 'auto_hidden', 'under_review', 'resolved', 'appealed', 'closed']);
const ACTIONS = new Set<ModerationAction>(['hide_sighting', 'restore_sighting', 'no_action']);
const VISIBILITIES = new Set<SightingVisibility>(['limited', 'public', 'hidden', 'archived']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function parseQueueItem(value: unknown): AdminModerationQueueItem {
  if (!isRecord(value)
    || !hasExactKeys(value, ['reportId', 'contentType', 'reasonCode', 'risk', 'status', 'dueAt'])
    || !isUuid(value.reportId)
    || value.contentType !== 'sighting'
    || typeof value.reasonCode !== 'string'
    || !REASON_CODES.has(value.reasonCode)
    || typeof value.risk !== 'string'
    || !RISKS.has(value.risk as ModerationRisk)
    || typeof value.status !== 'string'
    || !STATUSES.has(value.status as ModerationStatus)
    || !isTimestamp(value.dueAt)) {
    throw new Error('invalid_admin_moderation_queue');
  }

  return value as AdminModerationQueueItem;
}

function parseReport(value: unknown): AdminModerationReport {
  if (!isRecord(value)
    || !hasExactKeys(value, ['reportId', 'contentType', 'reasonCode', 'risk', 'status', 'dueAt', 'createdAt'])
    || !isTimestamp(value.createdAt)) {
    throw new Error('invalid_admin_moderation_report');
  }

  const { createdAt, ...queueItem } = value;
  return { ...parseQueueItem(queueItem), createdAt };
}

function parseResolutionResult(value: unknown): ModerationResolutionResult {
  if (!isRecord(value)
    || !hasExactKeys(value, ['reportId', 'action', 'status', 'visibility'])
    || !isUuid(value.reportId)
    || typeof value.action !== 'string'
    || !ACTIONS.has(value.action as ModerationAction)
    || value.status !== 'resolved'
    || typeof value.visibility !== 'string'
    || !VISIBILITIES.has(value.visibility as SightingVisibility)) {
    throw new Error('invalid_admin_moderation_resolution');
  }

  return value as ModerationResolutionResult;
}

function throwIfRpcError(error: unknown): void {
  if (error) throw new Error('admin_moderation_rpc_failed');
}

export async function listModerationQueue(
  client: NarrowRpcClient,
  requestId: string,
): Promise<readonly AdminModerationQueueItem[]> {
  if (!isUuid(requestId)) throw new Error('invalid_admin_moderation_request');
  const { data, error } = await client.rpc('admin_list_moderation_queue', { p_request_id: requestId });
  throwIfRpcError(error);
  if (!Array.isArray(data)) throw new Error('invalid_admin_moderation_queue');
  return data.map(parseQueueItem);
}

export async function getModerationReport(
  client: NarrowRpcClient,
  reportId: string,
  requestId: string,
): Promise<AdminModerationReport> {
  if (!isUuid(reportId) || !isUuid(requestId)) throw new Error('invalid_admin_moderation_request');
  const { data, error } = await client.rpc('admin_get_moderation_report', {
    p_report_id: reportId,
    p_request_id: requestId,
  });
  throwIfRpcError(error);
  if (!Array.isArray(data) || data.length !== 1) throw new Error('invalid_admin_moderation_report');
  return parseReport(data[0]);
}

export function parseModerationResolution(value: unknown): ModerationResolution {
  if (!isRecord(value)
    || !hasExactKeys(value, ['reportId', 'action', 'rationale'])
    || !isUuid(value.reportId)
    || typeof value.action !== 'string'
    || !ACTIONS.has(value.action as ModerationAction)
    || typeof value.rationale !== 'string') {
    throw new Error('invalid_moderation_resolution');
  }

  const rationale = value.rationale.trim();
  if (rationale.length < 10 || rationale.length > 2000) throw new Error('invalid_moderation_resolution');
  return { reportId: value.reportId, action: value.action as ModerationAction, rationale };
}

export async function resolveModerationReport(
  client: NarrowRpcClient,
  input: unknown,
  requestId: string,
): Promise<ModerationResolutionResult> {
  const resolution = parseModerationResolution(input);
  if (!isUuid(requestId)) throw new Error('invalid_admin_moderation_request');
  const { data, error } = await client.rpc('admin_resolve_moderation_report', {
    p_report_id: resolution.reportId,
    p_action: resolution.action,
    p_rationale: resolution.rationale,
    p_request_id: requestId,
  });
  throwIfRpcError(error);
  if (!Array.isArray(data) || data.length !== 1) throw new Error('invalid_admin_moderation_resolution');
  return parseResolutionResult(data[0]);
}
