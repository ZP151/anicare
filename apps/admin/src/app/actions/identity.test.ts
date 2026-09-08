import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const io = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({ createWritableAdminServerClient: async () => ({ rpc: io.rpc, auth: { getUser: io.getUser } }) }));
vi.mock('next/cache', () => ({ revalidatePath: io.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('redirect:' + path); } }));
import { resolveIdentityReviewAction } from './identity';
const proposal = '00000000-0000-4000-8000-000000003002';
const request = '00000000-0000-4000-8000-000000003003';
function form(decision: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ proposalId: proposal, requestId: request, decision, rationale: 'Independent evidence supports this decision.', alias: 'Typed cat name' })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  io.getUser.mockResolvedValue({ data: { user: { id: request } }, error: null });
  io.rpc.mockImplementation(async (name: string, params?: Record<string, unknown>) => name === 'identity_has_active_reviewer'
    ? { data: true, error: null }
    : name === 'decide_identity_review_workbench' ? { data: [{ proposalId: proposal, decision: params?.p_decision, status: params?.p_decision === 'confirm' ? 'confirmed' : 'rejected', animalId: null }], error: null }
    : { data: [], error: null });
});
describe('real identity review server action', () => {
  it('replays the exact submitted request even after the proposal left the tentative detail', async () => {
    const data = form('confirm');
    await expect(resolveIdentityReviewAction('new_animal', data)).rejects.toThrow('redirect:/identity');
    await expect(resolveIdentityReviewAction('new_animal', data)).rejects.toThrow('redirect:/identity');
    const decisions = io.rpc.mock.calls.filter(([name]) => name === 'decide_identity_review_workbench');
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual(decisions[1]);
    expect(decisions[0]?.[1]).toMatchObject({ p_request_id: request, p_primary_alias: 'Typed cat name' });
    expect(io.rpc.mock.calls.some(([name]) => name === 'get_identity_review_detail')).toBe(false);
    expect(io.revalidate).toHaveBeenCalledTimes(2);
  });
  it.each(['reject', 'needs_more_evidence'])('submits new-cat %s without requiring or sending the alias field', async (decision) => {
    await expect(resolveIdentityReviewAction('new_animal', form(decision))).rejects.toThrow('redirect:/identity');
    expect(io.rpc).toHaveBeenCalledWith('decide_identity_review_workbench', expect.objectContaining({ p_decision: decision, p_primary_alias: null, p_request_id: request }));
  });
  it('does not submit a decision without a verified signed-in user', async () => {
    io.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(resolveIdentityReviewAction('new_animal', form('confirm'))).rejects.toThrow('redirect:/login');
    expect(io.rpc).not.toHaveBeenCalled();
  });
});
