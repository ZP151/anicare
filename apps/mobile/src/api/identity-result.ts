import { getSupabaseClient } from './supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MyIdentityResult = Readonly<{
  proposalId: string;
  requestId: string | null;
  status: 'tentative' | 'confirmed' | 'rejected' | 'superseded';
  decision: 'confirm' | 'reject' | 'needs_more_evidence' | null;
  animalId: string | null;
}>;

type IdentityResultClient = Readonly<{
  rpc(name: 'get_my_identity_result', input: Readonly<{ p_sighting_id: string }>): PromiseLike<Readonly<{ data: unknown; error: unknown | null }>>;
}>;

function parse(value: unknown): MyIdentityResult | null {
  if (value === null || Array.isArray(value) && value.length === 0) return null;
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) throw new Error('invalid_identity_result');
  const row = value[0] as Record<string, unknown>;
  if (Object.keys(row).length !== 5 || typeof row.proposalId !== 'string' || !UUID.test(row.proposalId)
    || (row.requestId !== null && (typeof row.requestId !== 'string' || !UUID.test(row.requestId)))
    || (row.status !== 'tentative' && row.status !== 'confirmed' && row.status !== 'rejected' && row.status !== 'superseded')
    || (row.decision !== 'confirm' && row.decision !== 'reject' && row.decision !== 'needs_more_evidence' && row.decision !== null)
    || (typeof row.animalId !== 'string' && row.animalId !== null) || (typeof row.animalId === 'string' && !UUID.test(row.animalId))) throw new Error('invalid_identity_result');
  return row as MyIdentityResult;
}

export async function getMyIdentityResult(sightingId: string, client: IdentityResultClient | null = getSupabaseClient() as unknown as IdentityResultClient | null): Promise<MyIdentityResult | null> {
  if (!client || !UUID.test(sightingId)) throw new Error('identity_result_unavailable');
  try {
    const reply = await client.rpc('get_my_identity_result', { p_sighting_id: sightingId });
    if (reply.error) throw new Error('identity_result_unavailable');
    return parse(reply.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_identity_result') throw error;
    throw new Error('identity_result_unavailable');
  }
}
