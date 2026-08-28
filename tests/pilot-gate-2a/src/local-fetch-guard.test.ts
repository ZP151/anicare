import { describe, expect, it, vi } from 'vitest';

import { installPilotGate2AFetchBoundary } from './local-fetch-guard.js';

const LOCAL_API_URL = 'http://127.0.0.1:54321';

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: LOCAL_API_URL,
    SUPABASE_ANON_KEY: ['local', 'anon', 'key'].join('-'),
    SUPABASE_SERVICE_ROLE_KEY: ['local', 'service', 'role', 'key'].join('-'),
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    MEDIA_ALLOWED_ORIGIN: LOCAL_API_URL,
    PRECISE_LOCATION_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
  };
}

describe('mandatory Pilot Gate 2A fetch boundary', () => {
  it('rejects a hardcoded remote fetch before dispatch without relying on a test environment read', async () => {
    const dispatch = vi.fn<typeof fetch>(async () => new Response('local'));
    const target = { fetch: dispatch };
    installPilotGate2AFetchBoundary(validEnvironment(), target);

    const hardcodedRemote = ['https://project-ref.supabase.co', 'functions', 'v1', 'create-sighting'].join('/');
    await expect(target.fetch(hardcodedRemote)).rejects.toThrow(
      'Pilot Gate 2A fetch target must be loopback HTTP(S).',
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1:54321/health',
    'https://localhost:8443/health',
    'http://[::1]:54321/health',
  ])('permits a loopback HTTP(S) target after validating the environment once: %s', async (url) => {
    const dispatch = vi.fn<typeof fetch>(async () => new Response('local'));
    const target = { fetch: dispatch };
    const source = validEnvironment();
    installPilotGate2AFetchBoundary(source, target);
    source.SUPABASE_URL = 'https://remote.invalid';

    await expect(target.fetch(url)).resolves.toBeInstanceOf(Response);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('fails during setup when the local environment contract is invalid', () => {
    const target = { fetch: vi.fn<typeof fetch>(async () => new Response()) };

    expect(() => installPilotGate2AFetchBoundary({ ...validEnvironment(), SUPABASE_URL: 'https://remote.invalid' }, target))
      .toThrow('Invalid Pilot Gate 2A environment.');
    expect(target.fetch).not.toHaveBeenCalled();
  });
});
