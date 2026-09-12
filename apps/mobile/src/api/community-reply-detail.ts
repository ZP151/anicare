import { PROFILE_AVATAR_KEYS } from '../profile/profile-avatar';
import { getSupabaseClient } from './supabase';
import type { CommunityReply, CommunityRpcClient } from './community';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export async function getCommunityReply(id:string,client:CommunityRpcClient|null=getSupabaseClient()):Promise<CommunityReply>{
 if(!client||!UUID.test(id))throw new Error('community_reply_unavailable');
 const {data,error}=await client.rpc('get_public_community_reply',{p_reply_id:id});
 if(!error&&Array.isArray(data)&&data.length===0)throw new Error('community_reply_hidden');
 const row=Array.isArray(data)&&data.length===1?data[0]:null;
 if(error||!record(row)||Object.keys(row).length!==6||row.replyId!==id||row.cursor!==id||typeof row.body!=='string'||!row.body.trim()||row.body.length>2000||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||typeof row.canDelete!=='boolean'||!record(row.author)||Object.keys(row.author).length!==2||typeof row.author.name!=='string'||!row.author.name.trim()||row.author.name.length>60||typeof row.author.avatarKey!=='string'||!PROFILE_AVATAR_KEYS.includes(row.author.avatarKey as typeof PROFILE_AVATAR_KEYS[number]))throw new Error('community_reply_unavailable');
 return row as CommunityReply;
}
