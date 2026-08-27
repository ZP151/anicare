import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const proxyMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAdminPublicSupabaseConfig: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient: proxyMocks.createServerClient }));
vi.mock('./lib/supabase/config', () => ({ getAdminPublicSupabaseConfig: proxyMocks.getAdminPublicSupabaseConfig }));

const proxyPath = fileURLToPath(new URL('./proxy.ts', import.meta.url));
const loginPath = fileURLToPath(new URL('./app/login/page.tsx', import.meta.url));
const actionPath = fileURLToPath(new URL('./app/actions/moderation.ts', import.meta.url));
const callbackPath = fileURLToPath(new URL('./app/auth/callback/route.ts', import.meta.url));
const serverClientPath = fileURLToPath(new URL('./lib/supabase/server.ts', import.meta.url));

describe('admin SSR session boundaries', () => {
  it('propagates a rotated cookie to the browser and same-request middleware header', async () => {
    const { NextRequest } = await import('next/server');
    const { proxy } = await import('./proxy.js');
    proxyMocks.getAdminPublicSupabaseConfig.mockReturnValue({ url: 'https://project.supabase.co', key: 'publishable-key' });
    proxyMocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([{ name: 'sb-access-token', value: 'rotated', options: { path: '/' } }]);
          return { data: { user: null }, error: null };
        },
      },
    }));
    const request = new NextRequest('https://admin.example.test/');
    request.cookies.set('sb-access-token', 'stale');

    const response = await proxy(request);

    expect(response.cookies.get('sb-access-token')?.value).toBe('rotated');
    expect(response.headers.get('x-middleware-request-cookie')).toContain('sb-access-token=rotated');
  });

  it('uses a Next 16 proxy that propagates rotated cookies to both request and response', async () => {
    const source = await readFile(proxyPath, 'utf8');

    expect(source).toContain('export async function proxy');
    expect(source).toContain('request.cookies.set(name, value)');
    expect(source).toContain('response.cookies.set(name, value, options)');
    expect(source).toContain('_next/static');
  });

  it('uses a canonical closed-account login origin and never trusts request Origin', async () => {
    const source = await readFile(loginPath, 'utf8');

    expect(source).toContain('shouldCreateUser: false');
    expect(source).toContain('getAdminAppUrl');
    expect(source).not.toContain("from 'next/headers'");
    expect(source).toContain('isAdminLoginConfigured');
    expect(source).toContain("redirect('/login?error=unavailable')");
    expect(source).toContain("if (!currentClient) redirect('/login?error=unavailable')");
  });

  it('does not swallow a writable cookie persistence failure in callbacks or actions', async () => {
    const source = await readFile(serverClientPath, 'utf8');
    const writableClient = source.slice(source.indexOf('createWritableAdminServerClient'));

    expect(writableClient).toContain('cookieStore.set(name, value, options)');
    expect(writableClient).not.toContain('catch');
  });

  it('redirects callback outcomes only through the canonical configured admin origin', async () => {
    const source = await readFile(callbackPath, 'utf8');

    expect(source).toContain('getAdminAppUrl');
    expect(source).toContain('NextResponse.json');
    expect(source).not.toContain("new URL('/login?error=callback_failed', request.url)");
  });

  it('redirects a failed moderation RPC to a generic error state instead of exposing the error', async () => {
    const source = await readFile(actionPath, 'utf8');

    expect(source).toContain("redirect('/?error=moderation_failed')");
    expect(source).toContain('catch');
  });
});
