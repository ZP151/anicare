import { getSupabaseClient } from './supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_CELL = /^[0-9a-f]{10,20}$/i;
const VERIFICATIONS = new Set([
  'reported',
  'community_confirmed',
  'partner_confirmed',
  'disputed',
  'superseded',
]);
const TIME_BUCKETS = new Set(['today', 'this_week', 'earlier']);
const FEED_ROW_KEYS = [
  'sightingId',
  'animalId',
  'primaryAlias',
  'verification',
  'publicCellId',
  'timeBucket',
  'coverMediaId',
  'cursor',
] as const;

export type PublicSighting = Readonly<{
  sightingId: string;
  animalId: string;
  primaryAlias: string;
  verification: 'reported' | 'community_confirmed' | 'partner_confirmed' | 'disputed' | 'superseded';
  publicCellId: string;
  timeBucket: 'today' | 'this_week' | 'earlier';
  coverMediaId: string | null;
  cursor: string;
}>;

export type PublicSightingPage = Readonly<{
  items: readonly PublicSighting[];
  nextCursor: string | null;
}>;

export type PublicFeedRequest = Readonly<{
  cursor?: string | null;
  limit?: number;
}>;

export interface NarrowRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<Readonly<{ data: unknown; error: unknown }>>;
}

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

function parsePublicSighting(value: unknown): PublicSighting {
  if (!hasExactKeys(value, FEED_ROW_KEYS) ||
      !isUuid(value.sightingId) || !isUuid(value.animalId) ||
      typeof value.primaryAlias !== 'string' || value.primaryAlias.length < 1 || value.primaryAlias.length > 80 ||
      typeof value.verification !== 'string' || !VERIFICATIONS.has(value.verification) ||
      typeof value.publicCellId !== 'string' || !PUBLIC_CELL.test(value.publicCellId) ||
      typeof value.timeBucket !== 'string' || !TIME_BUCKETS.has(value.timeBucket) ||
      (value.coverMediaId !== null && !isUuid(value.coverMediaId)) || !isUuid(value.cursor)) {
    throw new Error('invalid_public_sighting_feed');
  }
  return value as PublicSighting;
}

export function parsePublicSightingFeed(value: unknown): PublicSightingPage {
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error('invalid_public_sighting_feed');
  }
  const items = value.map(parsePublicSighting);
  return { items, nextCursor: items.at(-1)?.cursor ?? null };
}

export function buildPublicFeedRpcArgs(input: PublicFeedRequest = {}): Readonly<{
  p_cursor: string | null;
  p_limit: number;
}> {
  if (!isPlainObject(input) || Object.keys(input).some((key) => key !== 'cursor' && key !== 'limit')) {
    throw new Error('invalid_public_feed_request');
  }
  const cursor = input.cursor ?? null;
  if (cursor !== null && !isUuid(cursor)) throw new Error('invalid_public_feed_request');
  const requestedLimit = input.limit ?? 20;
  if (typeof requestedLimit !== 'number' || !Number.isInteger(requestedLimit) || !Number.isFinite(requestedLimit)) {
    throw new Error('invalid_public_feed_request');
  }
  return { p_cursor: cursor, p_limit: Math.min(50, Math.max(1, requestedLimit)) };
}

export async function listPublicSightings(
  input: PublicFeedRequest = {},
  client?: NarrowRpcClient,
): Promise<PublicSightingPage> {
  const rpcClient = client ?? (getSupabaseClient() as unknown as NarrowRpcClient | null);
  if (!rpcClient) throw new Error('feed_unavailable');
  const { data, error } = await rpcClient.rpc('list_public_sighting_feed', buildPublicFeedRpcArgs(input));
  if (error) throw new Error('feed_unavailable');
  return parsePublicSightingFeed(data);
}
