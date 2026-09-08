import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
vi.mock('server-only', () => ({}));
const io = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({ createAdminServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000003003' } }, error: null }) }, rpc: io.rpc }) }));
vi.mock('../actions/identity', () => ({ resolveIdentityReviewAction: async () => {} }));
import Page from './page';
const first = '00000000-0000-4000-8000-000000003100';
const time = '2026-09-08T00:00:00.000Z';
beforeEach(() => { vi.clearAllMocks(); });
it('renders a next page and carries its cursor into the real queue call', async () => {
  io.rpc.mockImplementation(async (name: string) => name === 'identity_has_active_reviewer' ? { data: true, error: null }
    : name === 'list_identity_review_queue' ? { data: Array.from({ length: 20 }, (_, i) => ({ proposalId: `00000000-0000-4000-8000-${String(3100+i).padStart(12,'0')}`, source: 'new_animal', status: 'tentative', createdAt: time })), error: null }
    : { data: [{ proposalId: first, source: 'new_animal', status: 'tentative', createdAt: time, proposedAlias: null, timeBucket: 'morning', evidenceState: 'unavailable' }], error: null });
  const tree = await Page({ searchParams: Promise.resolve({ beforeCreatedAt: time, beforeProposalId: first }) });
  const html = renderToStaticMarkup(tree);
  expect(io.rpc).toHaveBeenCalledWith('list_identity_review_queue', expect.objectContaining({ p_before_created_at: time, p_before_proposal_id: first }));
  expect(html).toContain('Next page');
  expect(html).toContain('00000000-0000-4000-8000-000000003119');
  const aliasInput = html.match(/<input[^>]*name="alias"[^>]*>/)?.[0];
  expect(aliasInput).toBeDefined();
  expect(aliasInput).not.toContain('required');
});
