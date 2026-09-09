import { getSupabaseClient } from './supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^avatars\/[0-9a-f-]{36}\.jpg$/i;
type Client = Readonly<{ rpc(name: 'get_public_community_avatars', args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>; storage: Readonly<{ from(bucket: 'profile-avatars'): Readonly<{ createSignedUrls(paths: string[], ttl: number): PromiseLike<{ data: unknown; error: unknown }> }> }> }>;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validUrl(value: unknown, path: string, origin: string): value is string { try { const url = new URL(String(value)); const expected = new URL(origin); return expected.protocol==='https:' && url.protocol==='https:' && !url.username && !url.password && !url.hash && url.origin===expected.origin && url.pathname===`/storage/v1/object/sign/profile-avatars/${path}` && [...url.searchParams.keys()].every(key=>key==='token') && url.searchParams.getAll('token').length===1 && !!url.searchParams.get('token'); } catch { return false; } }

export async function getCommunityAvatars(contentType: 'community_post'|'community_reply', contentIds: readonly string[], client: Client | null = getSupabaseClient() as unknown as Client | null, origin = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''): Promise<Map<string,string>> {
 const ids=[...new Set(contentIds.map(id=>id.toLowerCase()))]; if(!client||!ids.length||ids.length>50||ids.some(id=>!UUID.test(id))) return new Map();
 const result=await client.rpc('get_public_community_avatars',{p_content_type:contentType,p_content_ids:ids}); if(result.error||!Array.isArray(result.data)) return new Map();
 const rows=result.data.flatMap(value=>record(value)&&Object.keys(value).length===2&&typeof value.contentId==='string'&&ids.includes(value.contentId.toLowerCase())&&typeof value.avatarPath==='string'&&PATH.test(value.avatarPath)?[{id:value.contentId.toLowerCase(),path:value.avatarPath}]:[]); if(!rows.length) return new Map(); const signed=await client.storage.from('profile-avatars').createSignedUrls(rows.map(row=>row.path),60); if(signed.error||!Array.isArray(signed.data)) return new Map();
 const urls=new Map<string,string>(); for(const value of signed.data) if(record(value)&&typeof value.path==='string'&&typeof value.signedUrl==='string'&&validUrl(value.signedUrl,value.path,origin)) urls.set(value.path,value.signedUrl); return new Map(rows.flatMap(row=>urls.has(row.path)?[[row.id,urls.get(row.path)!]]:[]));
}
