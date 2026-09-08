import { getSupabaseClient } from './supabase';
import { randomUUID } from 'expo-crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const AVATARS = new Set(['cat', 'paw', 'leaf', 'sun', 'moon', 'heart']);

export type CommunityPost = Readonly<{ postId: string; body: string; catId: string | null; communitySlug: string | null; createdAt: string; author: Readonly<{ name: string; avatarKey: string }>; replyCount: number; canDelete: boolean; cursor: string }>;
export type CommunityPage = Readonly<{ items: readonly CommunityPost[]; nextCursor: string | null }>;
export type CommunityFeedInput = Readonly<{ cursor?: string | null; limit?: number; communitySlug?: string | null; catId?: string | null }>;
export interface CommunityRpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>; }

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function timestamp(value: unknown): value is string { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }

function parsePost(value: unknown): CommunityPost {
  if (!record(value) || Object.keys(value).length !== 9 || !uuid(value.postId) || typeof value.body !== 'string' || value.body.length < 1 || value.body.length > 2000 || (value.catId !== null && !uuid(value.catId)) || (value.communitySlug !== null && (typeof value.communitySlug !== 'string' || !SLUG.test(value.communitySlug))) || !timestamp(value.createdAt) || !record(value.author) || Object.keys(value.author).length !== 2 || typeof value.author.name !== 'string' || value.author.name.length < 1 || value.author.name.length > 60 || typeof value.author.avatarKey !== 'string' || !AVATARS.has(value.author.avatarKey) || typeof value.replyCount !== 'number' || !Number.isInteger(value.replyCount) || value.replyCount < 0 || typeof value.canDelete !== 'boolean' || !uuid(value.cursor)) throw new Error('invalid_community_feed');
  return value as CommunityPost;
}

export function parseCommunityFeed(value: unknown): CommunityPage {
  if (!Array.isArray(value) || value.length > 50) throw new Error('invalid_community_feed');
  const items = value.map(parsePost); return { items, nextCursor: items.at(-1)?.cursor ?? null };
}

export function buildCommunityFeedArgs(input: CommunityFeedInput = {}): Readonly<{ p_cursor: string | null; p_limit: number; p_community_slug: string | null; p_cat_id: string | null }> {
  if (!record(input) || Object.keys(input).some((key) => !['cursor', 'limit', 'communitySlug', 'catId'].includes(key))) throw new Error('invalid_community_feed_request');
  const cursor = input.cursor ?? null; const communitySlug = input.communitySlug ?? null; const catId = input.catId ?? null; const limit = input.limit ?? 20;
  if ((cursor !== null && !uuid(cursor)) || (catId !== null && !uuid(catId)) || (communitySlug !== null && (typeof communitySlug !== 'string' || !SLUG.test(communitySlug))) || !Number.isInteger(limit) || limit < 1) throw new Error('invalid_community_feed_request');
  return { p_cursor: cursor, p_limit: Math.min(limit, 50), p_community_slug: communitySlug, p_cat_id: catId };
}

export async function listCommunityPosts(input: CommunityFeedInput = {}, client?: CommunityRpcClient): Promise<CommunityPage> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc) throw new Error('community_unavailable');
  const { data, error } = await rpc.rpc('list_public_community_posts', buildCommunityFeedArgs(input));
  if (error) throw new Error('community_unavailable'); return parseCommunityFeed(data);
}
export async function getCommunityPost(postId: string, client?: CommunityRpcClient): Promise<CommunityPost> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !uuid(postId)) throw new Error('invalid_community_post');
  const { data, error } = await rpc.rpc('get_public_community_post', { p_post_id: postId });
  if (error || !Array.isArray(data) || data.length !== 1) throw new Error('community_unavailable'); return parsePost(data[0]);
}

function requestId(): string { return randomUUID(); }
export async function createCommunityPost(body: string, catId: string | null, communitySlug: string | null, client?: CommunityRpcClient, pendingRequestId = requestId()): Promise<string> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !body.trim() || body.trim().length > 2000 || (!catId && !communitySlug)) throw new Error('invalid_community_post');
  const { data, error } = await rpc.rpc('create_community_post', { p_body: body.trim(), p_cat_id: catId, p_community_slug: communitySlug, p_request_id: pendingRequestId });
  if (error || !uuid(data)) throw new Error('community_write_failed'); return data;
}
export async function createCommunityReply(postId: string, body: string, client?: CommunityRpcClient, pendingRequestId = requestId()): Promise<string> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !uuid(postId) || !body.trim() || body.trim().length > 2000) throw new Error('invalid_community_reply');
  const { data, error } = await rpc.rpc('create_community_reply', { p_post_id: postId, p_body: body.trim(), p_request_id: pendingRequestId });
  if (error || !uuid(data)) throw new Error('community_write_failed'); return data;
}
export async function blockCommunityAuthor(contentType: 'community_post' | 'community_reply', contentId: string, client?: CommunityRpcClient): Promise<void> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !uuid(contentId)) throw new Error('invalid_community_block');
  const { error } = await rpc.rpc('block_community_author', { p_content_type: contentType, p_content_id: contentId, p_request_id: requestId() }); if (error) throw new Error('community_block_failed');
}
export async function deleteCommunityContent(contentType: 'community_post' | 'community_reply', contentId: string, client?: CommunityRpcClient, pendingRequestId = requestId()): Promise<void> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !uuid(contentId)) throw new Error('invalid_community_delete');
  const { error } = await rpc.rpc('delete_community_content', { p_content_type: contentType, p_content_id: contentId, p_request_id: pendingRequestId }); if (error) throw new Error('community_delete_failed');
}
export const deleteCommunityPost = (postId: string, client?: CommunityRpcClient, pendingRequestId?: string) => deleteCommunityContent('community_post', postId, client, pendingRequestId);
export async function reportCommunityContent(contentType: 'community_post' | 'community_reply', contentId: string, reason: string, client?: CommunityRpcClient): Promise<void> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !uuid(contentId) || !['spam', 'harassment', 'animal_welfare', 'unsafe_location', 'precise_location_exposure'].includes(reason)) throw new Error('invalid_community_report');
  const { error } = await rpc.rpc('create_community_moderation_report', { p_content_type: contentType, p_content_id: contentId, p_reason_code: reason, p_detail: null, p_request_id: requestId() }); if (error) throw new Error('community_report_failed');
}
export type CommunityReply = Readonly<{ replyId: string; body: string; createdAt: string; author: Readonly<{ name: string; avatarKey: string }>; canDelete: boolean; cursor: string }>;
export async function listCommunityReplies(postId: string, cursor: string | null = null, client?: CommunityRpcClient): Promise<Readonly<{ items: readonly CommunityReply[]; nextCursor: string | null }>> {
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc || !uuid(postId)) throw new Error('invalid_community_reply');
  const { data, error } = await rpc.rpc('list_public_community_replies', { p_post_id: postId, p_cursor: cursor, p_limit: 30 });
  if (error || !Array.isArray(data)) throw new Error('community_unavailable');
  const items=data.map((value) => { if (!record(value) || !uuid(value.replyId) || typeof value.body !== 'string' || !timestamp(value.createdAt) || !record(value.author) || typeof value.author.name !== 'string' || typeof value.author.avatarKey !== 'string' || typeof value.canDelete !== 'boolean' || !uuid(value.cursor)) throw new Error('invalid_community_reply'); return value as CommunityReply; }); return {items,nextCursor:items.at(-1)?.cursor??null};
}
