import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);
vi.mock('server-only', () => ({}));
const io = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../lib/admin-session', () => ({ getAdminSession: async (factory: () => Promise<unknown>) => ({ state: 'authorised', client: await factory() }) }));
vi.mock('../../lib/supabase/server', () => ({ createAdminServerClient: async () => ({}) }));
vi.mock('../../lib/rights-api', () => ({ RIGHTS_UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, listRightsQueue: io.list }));
vi.mock('../actions/rights', () => ({ processErasureAction: async () => {}, updateRightsAction: async () => {} }));

import Page from './page';

const request = '00000000-0000-4000-8000-000000006001';

it('shows the exact durable account-erasure result, including cleanup pending', async () => {
  io.list.mockResolvedValue([]);
  const tree = await Page({ searchParams: Promise.resolve({ erasureRequestId: request, erasureStatus: 'cleanup_pending' }) });
  expect(renderToStaticMarkup(tree)).toContain('Account erasure status: cleanup pending.');
});

it('does not render an unrecognized erasure result supplied in the URL', async () => {
  io.list.mockResolvedValue([]);
  const tree = await Page({ searchParams: Promise.resolve({ erasureRequestId: request, erasureStatus: 'completed_by_guess' }) });
  expect(renderToStaticMarkup(tree)).not.toContain('Account erasure status:');
});
