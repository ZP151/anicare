import 'server-only';

export type IdentitySource = 'manual_search' | 'new_animal' | 'ai_candidate';
export type IdentityStatus = 'tentative' | 'confirmed' | 'rejected' | 'superseded';
export type IdentityDecision = 'confirm' | 'reject' | 'needs_more_evidence';

export interface NarrowIdentityRpcClient {
  rpc(functionName: string, parameters?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export type IdentityQueueItem = Readonly<{ proposalId: string; source: IdentitySource; status: 'tentative'; createdAt: string }>;
export type IdentityReviewDetail = IdentityQueueItem & Readonly<{ proposedAlias: string | null; timeBucket: 'overnight' | 'morning' | 'afternoon' | 'evening'; evidenceState: 'available' | 'unavailable' }>;
export type IdentityResolution = Readonly<{ proposalId: string; source: IdentitySource; decision: IdentityDecision; rationale: string; alias?: string; requestId: string }>;
export type IdentityResolutionResult = Readonly<{ proposalId: string; status: IdentityStatus; animalId: string | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES = new Set<IdentitySource>(['manual_search', 'new_animal', 'ai_candidate']);
const STATUSES = new Set<IdentityStatus>(['tentative', 'confirmed', 'rejected', 'superseded']);
const DECISIONS = new Set<IdentityDecision>(['confirm', 'reject', 'needs_more_evidence']);
const TIME_BUCKETS = new Set<IdentityReviewDetail['timeBucket']>(['overnight', 'morning', 'afternoon', 'evening']);

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(candidate);
  return prototype === Object.prototype || prototype === null ? candidate : null;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const candidate = record(value);
  if (!candidate) return null;
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]) ? candidate : null;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value));
}

function queueItem(value: unknown): IdentityQueueItem {
  const row = exact(value, ['proposalId', 'source', 'status', 'createdAt']);
  if (!row || typeof row.proposalId !== 'string' || !UUID.test(row.proposalId) || typeof row.source !== 'string' || !SOURCES.has(row.source as IdentitySource) || row.status !== 'tentative' || !timestamp(row.createdAt)) throw new Error('invalid_identity_review_queue');
  return row as unknown as IdentityQueueItem;
}

function detail(value: unknown): IdentityReviewDetail {
  const row = exact(value, ['proposalId', 'source', 'status', 'createdAt', 'proposedAlias', 'timeBucket', 'evidenceState']);
  if (!row || typeof row.proposedAlias !== 'string' && row.proposedAlias !== null || typeof row.timeBucket !== 'string' || !TIME_BUCKETS.has(row.timeBucket as IdentityReviewDetail['timeBucket']) || (row.evidenceState !== 'available' && row.evidenceState !== 'unavailable')) throw new Error('invalid_identity_review_detail');
  const base = queueItem({ proposalId: row.proposalId, source: row.source, status: row.status, createdAt: row.createdAt });
  return { ...base, proposedAlias: row.proposedAlias as string | null, timeBucket: row.timeBucket as IdentityReviewDetail['timeBucket'], evidenceState: row.evidenceState };
}

function result(value: unknown): IdentityResolutionResult {
  const row = exact(value, ['proposalId', 'status', 'animalId']);
  if (!row || typeof row.proposalId !== 'string' || !UUID.test(row.proposalId) || typeof row.status !== 'string' || !STATUSES.has(row.status as IdentityStatus) || typeof row.animalId !== 'string' && row.animalId !== null || (typeof row.animalId === 'string' && !UUID.test(row.animalId))) throw new Error('invalid_identity_review_resolution');
  return row as unknown as IdentityResolutionResult;
}

function failure(error: unknown): never {
  if (error instanceof Error && error.message.startsWith('invalid_identity_review_')) throw error;
  throw new Error('identity_review_unavailable');
}

export async function listIdentityReviewQueue(client: NarrowIdentityRpcClient, input: Readonly<{ limit: number; before: Readonly<{ createdAt: string; proposalId: string }> | null; requestId: string }>): Promise<readonly IdentityQueueItem[]> {
  if (!UUID.test(input.requestId) || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20 || (input.before && (!timestamp(input.before.createdAt) || !UUID.test(input.before.proposalId)))) throw new Error('invalid_identity_review_queue');
  try {
    const reply = await client.rpc('list_identity_review_queue', { p_limit: input.limit, p_before_created_at: input.before?.createdAt ?? null, p_before_proposal_id: input.before?.proposalId ?? null, p_request_id: input.requestId });
    if (reply.error || !Array.isArray(reply.data) || reply.data.length > input.limit) throw new Error('identity_review_unavailable');
    return reply.data.map(queueItem);
  } catch (error) { return failure(error); }
}

export async function getIdentityReviewDetail(client: NarrowIdentityRpcClient, proposalId: string, requestId: string): Promise<IdentityReviewDetail | null> {
  if (!UUID.test(proposalId) || !UUID.test(requestId)) throw new Error('invalid_identity_review_detail');
  try {
    const reply = await client.rpc('get_identity_review_detail', { p_proposal_id: proposalId, p_request_id: requestId });
    if (reply.error || !Array.isArray(reply.data) || reply.data.length > 1) throw new Error('identity_review_unavailable');
    return reply.data.length === 0 ? null : detail(reply.data[0]);
  } catch (error) { return failure(error); }
}

export async function resolveIdentityReview(client: NarrowIdentityRpcClient, input: IdentityResolution): Promise<IdentityResolutionResult> {
  const rationale = input.rationale.trim();
  const alias = input.alias?.trim();
  if (!UUID.test(input.proposalId) || !UUID.test(input.requestId) || !SOURCES.has(input.source) || !DECISIONS.has(input.decision) || rationale.length < 10 || rationale.length > 1000 || (input.source === 'new_animal' && input.decision === 'confirm' && (!alias || alias.length > 80)) || (input.source === 'new_animal' && input.decision !== 'confirm' && alias !== undefined) || (input.source !== 'new_animal' && alias !== undefined)) throw new Error('invalid_identity_review_resolution');
  const operation = ['decide_identity_review_workbench', {
    p_proposal_id: input.proposalId, p_decision: input.decision, p_rationale: rationale,
    p_primary_alias: input.source === 'new_animal' && input.decision === 'confirm' ? alias! : null,
    p_request_id: input.requestId,
  }] as const;
  try {
    const reply = await client.rpc(operation[0], operation[1]);
    if (reply.error || !Array.isArray(reply.data) || reply.data.length !== 1) throw new Error('identity_review_unavailable');
    const row = exact(reply.data[0], ['proposalId', 'decision', 'status', 'animalId']);
    if (!row) throw new Error('invalid_identity_review_resolution');
    return result({ proposalId: row.proposalId, status: row.status, animalId: row.animalId });
  } catch (error) { return failure(error); }
}
