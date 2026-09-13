import { PROFILE_AVATAR_KEYS } from '../profile/profile-avatar';
import type { CommunityRpcClient } from './community';
import { getSupabaseClient } from './supabase';

export type StoryCursor = Readonly<{ v: 1; catId: string; createdAt: string; postId: string }>;
export type CatStory = Readonly<{
  postId: string; catId: string; communitySlug: string | null; body: string; title: string | null;
  publishedAt: string; author: Readonly<{ name: string; avatarKey: string }>;
  replyCount: number; canEditLink: boolean; media: readonly Readonly<{ mediaId: string; width: number; height: number }>[];
}>;
export type CatStoryPage = Readonly<{ items: readonly CatStory[]; nextCursor: StoryCursor | null }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const avatars = new Set<string>(PROFILE_AVATAR_KEYS);
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function uuid(v: unknown): v is string { return typeof v === 'string' && UUID.test(v); }
function time(v: unknown): v is string { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)); }
function cursor(v: unknown, catId: string): v is StoryCursor {
  return object(v) && Object.keys(v).length === 4 && v.v === 1 && uuid(v.catId) && v.catId.toLowerCase() === catId.toLowerCase() && uuid(v.postId) && time(v.createdAt);
}
export function parseCatStories(value: unknown, catId: string): CatStoryPage {
  if (!uuid(catId)) throw new Error('invalid_cat_stories');
  catId = catId.toLowerCase();
  const fail = () => { throw new Error('invalid_cat_stories'); };
  if (!object(value) || Object.keys(value).length !== 2 || !Array.isArray(value.items) || value.items.length > 30 || (value.nextCursor !== null && !cursor(value.nextCursor, catId))) return fail();
  const seen = new Set<string>();
  const items = value.items.map((row: unknown) => {
    if (!object(row) || Object.keys(row).length !== 10 || !uuid(row.postId) || seen.has(row.postId.toLowerCase()) || !uuid(row.catId) || row.catId !== catId
      || (row.communitySlug !== null && (typeof row.communitySlug !== 'string' || !SLUG.test(row.communitySlug)))
      || typeof row.body !== 'string' || row.body.length < 1 || row.body.length > 2000
      || (row.title !== null && (typeof row.title !== 'string' || row.title.length < 1 || row.title.length > 120)) || !time(row.publishedAt)
      || !object(row.author) || Object.keys(row.author).length !== 2 || typeof row.author.name !== 'string' || !row.author.name.length || row.author.name.length > 60
      || typeof row.author.avatarKey !== 'string' || !avatars.has(row.author.avatarKey) || !Number.isSafeInteger(row.replyCount) || (row.replyCount as number) < 0
      || typeof row.canEditLink !== 'boolean' || !Array.isArray(row.media) || row.media.length > 6) return fail();
    const mediaIds = new Set<string>();
    for (const media of row.media) {
      if (!object(media) || Object.keys(media).length !== 3 || !uuid(media.mediaId) || mediaIds.has(media.mediaId.toLowerCase())
        || !Number.isInteger(media.width) || (media.width as number) < 1 || (media.width as number) > 2048
        || !Number.isInteger(media.height) || (media.height as number) < 1 || (media.height as number) > 2048) return fail();
      mediaIds.add(media.mediaId.toLowerCase());
    }
    seen.add(row.postId.toLowerCase());
    return row as CatStory;
  });
  if (value.nextCursor !== null && (!items.length || value.nextCursor.postId !== items.at(-1)!.postId || value.nextCursor.createdAt !== items.at(-1)!.publishedAt)) return fail();
  return { items, nextCursor: value.nextCursor as StoryCursor | null };
}
export async function listCatStories(catId: string, next: StoryCursor | null = null, client?: CommunityRpcClient): Promise<CatStoryPage> {
  if (!uuid(catId) || (next !== null && !cursor(next, catId))) throw new Error('invalid_cat_story_request');
  catId = catId.toLowerCase();
  if (next) next = { ...next, catId: next.catId.toLowerCase(), postId: next.postId.toLowerCase() };
  const rpc = client ?? getSupabaseClient() as unknown as CommunityRpcClient | null;
  if (!rpc) throw new Error('cat_stories_unavailable');
  const { data, error } = await rpc.rpc('list_public_cat_stories', { p_cat_id: catId, p_cursor: next, p_limit: 12 });
  if (error) throw new Error(object(error) && (error.message === 'cat_unavailable' || error.message === 'invalid_cat_story_request') ? error.message : 'cat_stories_unavailable');
  return parseCatStories(data, catId);
}
