import type { PublicSighting } from './feed';
import { getSupabaseClient } from './supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PublicCatSummary = Readonly<{
 animalId: string;
 primaryAlias: string;
 verification: PublicSighting['verification'];
 timeBucket: PublicSighting['timeBucket'] | null;
}>;
type CatClient = Readonly<{
 rpc(name: 'get_public_cat_summary', input: Readonly<{ p_animal_id: string }>): PromiseLike<Readonly<{data:unknown;error:unknown|null}>>;
}>;
function parse(data: unknown, requestedId: string): PublicCatSummary | null {
 if (data === null || Array.isArray(data) && data.length === 0) return null;
 if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object' || Array.isArray(data[0])) throw new Error('invalid_public_cat_summary');
 const row = data[0] as Record<string,unknown>;
 if (Object.keys(row).length !== 4 || typeof row.animalId !== 'string' || row.animalId.toLowerCase() !== requestedId.toLowerCase()
   || typeof row.primaryAlias !== 'string' || row.primaryAlias.trim().length === 0 || row.primaryAlias.length > 80
   || !['reported','community_confirmed','partner_confirmed','disputed','superseded'].includes(row.verification as string)
   || ![null,'today','this_week','earlier'].includes(row.timeBucket as string|null)) throw new Error('invalid_public_cat_summary');
 return row as PublicCatSummary;
}
export async function getPublicCatSummary(animalId: string, client: CatClient|null = getSupabaseClient() as unknown as CatClient|null): Promise<PublicCatSummary|null> {
 if (!UUID.test(animalId) || !client) throw new Error('public_cat_unavailable');
 let reply;
 try { reply = await client.rpc('get_public_cat_summary',{p_animal_id:animalId}); }
 catch { throw new Error('public_cat_unavailable'); }
 if (reply.error) throw new Error('public_cat_unavailable');
 return parse(reply.data,animalId);
}
