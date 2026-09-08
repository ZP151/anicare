import { getSupabaseClient } from './supabase';
import type { ReportIdentityIntent } from '../report/report-draft';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdentityProposalResult = Readonly<{
  proposalId: string;
  source: 'manual_search' | 'new_animal';
  status: 'tentative' | 'confirmed' | 'rejected' | 'superseded';
}>;

export type IdentityRpcClient = Readonly<{
  rpc(functionName: 'submit_identity_proposal', arguments_: Readonly<{
    p_sighting_id: string;
    p_proposed_animal_id: string | null;
    p_source: 'manual_search' | 'new_animal';
    p_request_id: string;
  }>): PromiseLike<Readonly<{ data: unknown; error: unknown | null }>>;
}>;

function parseResult(value: unknown): IdentityProposalResult {
  if (!Array.isArray(value) || value.length !== 1) throw new Error('identity_proposal_unavailable');
  const row = value[0];
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.getPrototypeOf(row) !== Object.prototype) {
    throw new Error('identity_proposal_unavailable');
  }
  const candidate = row as Record<string, unknown>;
  if (Object.keys(candidate).length !== 3 || !UUID.test(String(candidate.proposalId)) ||
      (candidate.source !== 'manual_search' && candidate.source !== 'new_animal') ||
      (candidate.status !== 'tentative' && candidate.status !== 'confirmed' && candidate.status !== 'rejected' && candidate.status !== 'superseded')) {
    throw new Error('identity_proposal_unavailable');
  }
  return candidate as unknown as IdentityProposalResult;
}

export async function submitIdentityProposal(
  input: Readonly<{ sightingId: string; intent: Exclude<ReportIdentityIntent, null>; requestId: string }>,
  client: IdentityRpcClient | null = getSupabaseClient() as unknown as IdentityRpcClient | null,
): Promise<IdentityProposalResult> {
  if (!client || !UUID.test(input.sightingId) || !UUID.test(input.requestId) ||
      (input.intent.kind === 'existing' && !UUID.test(input.intent.animalId))) {
    throw new Error('identity_proposal_unavailable');
  }
  try {
    const result = await client.rpc('submit_identity_proposal', {
      p_sighting_id: input.sightingId,
      p_proposed_animal_id: input.intent.kind === 'existing' ? input.intent.animalId : null,
      p_source: input.intent.kind === 'existing' ? 'manual_search' : 'new_animal',
      p_request_id: input.requestId,
    });
    if (result.error) throw new Error('rpc_failed');
    return parseResult(result.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'identity_proposal_unavailable') throw error;
    throw new Error('identity_proposal_unavailable');
  }
}
