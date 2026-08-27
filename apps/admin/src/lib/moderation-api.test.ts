import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getAdminSession } from './admin-session.js';
import { getAdminAppUrl, getAdminPublicSupabaseConfig } from './supabase/config.js';
import {
  getModerationReport,
  listModerationQueue,
  parseModerationResolution,
  resolveModerationReport,
  type NarrowRpcClient,
} from './moderation-api.js';
import { parseModerationResolutionForm } from '../app/actions/moderation.js';

const requestId = '00000000-0000-4000-8000-000000000001';
const reportId = '00000000-0000-4000-8000-000000000002';

function rpcClient(data: unknown, error: unknown = null): NarrowRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe('admin session gate', () => {
  it('fails closed when the public Supabase configuration is unavailable', async () => {
    await expect(getAdminSession(async () => null)).resolves.toEqual({ state: 'unavailable' });
  });

  it('requires a validated user instead of trusting a cookie-shaped session', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      rpc: vi.fn(),
    };

    await expect(getAdminSession(async () => client)).resolves.toEqual({ state: 'unauthenticated' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('classifies a malformed getUser payload as unavailable', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 42 } }, error: null }) },
      rpc: vi.fn(),
    };

    await expect(getAdminSession(async () => client as never)).resolves.toEqual({ state: 'unavailable' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['client construction failure', async () => { throw new Error('network'); }],
    ['getUser transport failure', async () => ({ auth: { getUser: async () => { throw new Error('network'); } }, rpc: vi.fn() })],
    ['getUser Supabase error', async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: new Error('network') }) }, rpc: vi.fn() })],
  ])('classifies %s as unavailable', async (_label, createClient) => {
    await expect(getAdminSession(createClient as never)).resolves.toEqual({ state: 'unavailable' });
  });

  it('classifies a capability RPC error as unavailable, not unauthorized', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-000000000003' } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('network') }),
    };

    await expect(getAdminSession(async () => client)).resolves.toEqual({ state: 'unavailable' });
  });

  it('denies a signed-in user without the narrow active-admin grant', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-000000000003' } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };

    await expect(getAdminSession(async () => client)).resolves.toEqual({ state: 'unauthorised' });
    expect(client.rpc).toHaveBeenCalledWith('admin_has_active_platform_admin');
  });

  it('authorises only a user accepted by the narrow active-admin RPC', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-000000000003' } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const session = await getAdminSession(async () => client);
    expect(session.state).toBe('authorised');
    if (session.state === 'authorised') expect(session.userId).toBe('00000000-0000-4000-8000-000000000003');
  });
});

describe('moderation RPC wrappers', () => {
  it('maps only the exact safe queue projection from the queue RPC', async () => {
    const client = rpcClient([{
      reportId,
      contentType: 'sighting',
      reasonCode: 'animal_welfare',
      risk: 'sensitive',
      status: 'open',
      dueAt: '2026-08-28T08:00:00.000Z',
    }]);

    await expect(listModerationQueue(client, requestId)).resolves.toEqual([{
      reportId,
      contentType: 'sighting',
      reasonCode: 'animal_welfare',
      risk: 'sensitive',
      status: 'open',
      dueAt: '2026-08-28T08:00:00.000Z',
    }]);
    expect(client.rpc).toHaveBeenCalledWith('admin_list_moderation_queue', { p_request_id: requestId });
  });

  it('fails closed when a queue RPC response includes a raw database column', async () => {
    const client = rpcClient([{
      reportId,
      contentType: 'sighting',
      reasonCode: 'animal_welfare',
      risk: 'sensitive',
      status: 'open',
      dueAt: '2026-08-28T08:00:00.000Z',
      storage_path: 'private-evidence/forbidden.jpg',
    }]);

    await expect(listModerationQueue(client, requestId)).rejects.toThrow('invalid_admin_moderation_queue');
  });

  it('maps only the exact safe report projection from the detail RPC', async () => {
    const client = rpcClient([{
      reportId,
      contentType: 'sighting',
      reasonCode: 'animal_welfare',
      risk: 'sensitive',
      status: 'open',
      dueAt: '2026-08-28T08:00:00.000Z',
      createdAt: '2026-08-27T08:00:00.000Z',
    }]);

    await expect(getModerationReport(client, reportId, requestId)).resolves.toEqual({
      reportId,
      contentType: 'sighting',
      reasonCode: 'animal_welfare',
      risk: 'sensitive',
      status: 'open',
      dueAt: '2026-08-28T08:00:00.000Z',
      createdAt: '2026-08-27T08:00:00.000Z',
    });
    expect(client.rpc).toHaveBeenCalledWith('admin_get_moderation_report', {
      p_report_id: reportId,
      p_request_id: requestId,
    });
  });

  it('uses the resolve RPC with no client-controlled actor field', async () => {
    const client = rpcClient([{
      reportId,
      action: 'hide_sighting',
      status: 'resolved',
      visibility: 'hidden',
    }]);

    await expect(resolveModerationReport(client, {
      reportId,
      action: 'hide_sighting',
      rationale: 'A sufficiently long moderation rationale.',
    }, requestId)).resolves.toEqual({
      reportId,
      action: 'hide_sighting',
      status: 'resolved',
      visibility: 'hidden',
    });
    expect(client.rpc).toHaveBeenCalledWith('admin_resolve_moderation_report', {
      p_report_id: reportId,
      p_action: 'hide_sighting',
      p_rationale: 'A sufficiently long moderation rationale.',
      p_request_id: requestId,
    });
  });

  it.each(['appealed', 'closed'])('accepts the database status %s in a narrow report response', async (status) => {
    const client = rpcClient([{
      reportId,
      contentType: 'sighting',
      reasonCode: 'animal_welfare',
      risk: 'sensitive',
      status,
      dueAt: '2026-08-28T08:00:00.000Z',
      createdAt: '2026-08-27T08:00:00.000Z',
    }]);

    await expect(getModerationReport(client, reportId, requestId)).resolves.toMatchObject({ status });
  });

  it.each([
    [{ reportId, action: 'delete_sighting', rationale: 'A sufficiently long but unsupported moderation reason.' }],
    [{ reportId, action: 'hide_sighting', rationale: 'too short' }],
    [{ reportId, action: 'hide_sighting', rationale: 'x'.repeat(2001) }],
    [{ reportId, action: 'hide_sighting', rationale: 'A sufficiently long moderation rationale.', actorId: reportId }],
  ])('rejects unsafe resolution input %#', (input) => {
    expect(() => parseModerationResolution(input as never)).toThrow('invalid_moderation_resolution');
  });
});

describe('admin public configuration', () => {
  it('requires both public Supabase values and a canonical secure admin origin', () => {
    expect(getAdminPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    })).toEqual({ url: 'https://project.supabase.co', key: 'publishable-key' });
    expect(getAdminPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ',
    })).toBeNull();
    expect(getAdminPublicSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'key' })).toBeNull();
    expect(getAdminAppUrl({ ADMIN_APP_URL: 'https://admin.example.test/' })).toBe('https://admin.example.test');
    expect(getAdminAppUrl({ ADMIN_APP_URL: 'http://localhost:3000/' })).toBe('http://localhost:3000');
    expect(getAdminAppUrl({ ADMIN_APP_URL: 'http://admin.example.test' })).toBeNull();
  });
});

describe('moderation server action input', () => {
  it('accepts exactly report, action, and rationale form fields', () => {
    const form = new FormData();
    form.set('reportId', reportId);
    form.set('action', 'no_action');
    form.set('rationale', 'A sufficiently long moderation rationale.');

    expect(parseModerationResolutionForm(form)).toEqual({
      reportId,
      action: 'no_action',
      rationale: 'A sufficiently long moderation rationale.',
    });
  });

  it('rejects browser-supplied identity or extra mutation fields', () => {
    const form = new FormData();
    form.set('reportId', reportId);
    form.set('action', 'hide_sighting');
    form.set('rationale', 'A sufficiently long moderation rationale.');
    form.set('actorId', '00000000-0000-4000-8000-000000000099');

    expect(() => parseModerationResolutionForm(form)).toThrow('invalid_moderation_resolution_form');
  });
});
