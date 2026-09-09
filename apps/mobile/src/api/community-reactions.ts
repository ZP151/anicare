import { getSupabaseClient } from './supabase';
import type { CommunityRpcClient } from './community';
export type CommunityReaction = Readonly<{ postId: string; likeCount: number; liked: boolean }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parse(value: unknown, ids: readonly string[]): Map<string,CommunityReaction> {
  if (!Array.isArray(value) || value.length > ids.length) throw new Error('invalid_reactions');
  const rows = value.map(row => {
    if (!row || Object.keys(row).length !== 3 || !ids.includes(row.postId) || !Number.isSafeInteger(row.likeCount) || row.likeCount < 0 || typeof row.liked !== 'boolean') throw new Error('invalid_reactions');
    return [row.postId,row] as const;
  });
  return new Map(rows);
}
export async function getCommunityReactions(ids: readonly string[], client: CommunityRpcClient | null = getSupabaseClient()): Promise<Map<string,CommunityReaction>> {
  if (!client || ids.length > 50 || ids.some(id => !uuid.test(id))) throw new Error('invalid_reaction_request');
  if (!ids.length) return new Map();
  const {data,error}=await client.rpc('get_community_post_reactions',{p_post_ids:[...new Set(ids)]});
  if(error) throw new Error('reactions_unavailable');
  return parse(data,ids);
}
export async function setCommunityLike(postId: string, liked: boolean, client: CommunityRpcClient | null = getSupabaseClient()): Promise<CommunityReaction> {
  if(!client || !uuid.test(postId)) throw new Error('invalid_reaction_request');
  const {data,error}=await client.rpc('set_community_post_like',{p_post_id:postId,p_liked:liked});
  if(error) throw new Error('like_failed');
  const result=parse(data,[postId]).get(postId); if(!result) throw new Error('like_failed'); return result;
}
