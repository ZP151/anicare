import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';

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

async function listenLocalServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<Readonly<{ port: number; close: () => Promise<void> }>> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('local test server did not bind');
  return {
    port: address.port,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

function nonLoopbackIpv4Address(): string {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  throw new Error('redirect regression requires a non-loopback test interface');
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

  it('forces redirect error for string, URL, and Request inputs before a local redirect can dispatch remotely', async () => {
    let remoteDispatches = 0;
    let redirectTarget = '';
    const server = await listenLocalServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: redirectTarget });
        response.end();
        return;
      }
      if (request.url === '/remote') remoteDispatches += 1;
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('unexpected remote dispatch');
    });
    try {
      redirectTarget = `http://${nonLoopbackIpv4Address()}:${server.port}/remote`;
      const directProbe = await globalThis.fetch(redirectTarget);
      expect(directProbe.status).toBe(200);
      expect(remoteDispatches).toBe(1);
      remoteDispatches = 0;
      const initial = `http://127.0.0.1:${server.port}/redirect`;
      const target = { fetch: globalThis.fetch };
      installPilotGate2AFetchBoundary(validEnvironment(), target);

      for (const input of [initial, new URL(initial), new Request(initial)]) {
        await expect(target.fetch(input)).rejects.toBeDefined();
      }
      expect(remoteDispatches).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('preserves ordinary local Auth and Storage request behavior', async () => {
    const received: Array<Readonly<{ method: string; url: string; authorization: string | undefined; body: string }>> = [];
    const server = await listenLocalServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        received.push({
          method: request.method ?? '',
          url: request.url ?? '',
          authorization: request.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(request.url?.startsWith('/storage/') ? 201 : 200);
        response.end('local');
      });
    });
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const target = { fetch: globalThis.fetch };
      installPilotGate2AFetchBoundary(validEnvironment(), target);

      const auth = await target.fetch(`${origin}/auth/v1/health`, { headers: { apikey: 'local-anon-key' } });
      const storage = await target.fetch(new Request(`${origin}/storage/v1/object/media-staging/path`, {
        method: 'POST',
        headers: { authorization: 'Bearer local-token' },
        body: 'jpeg-fixture',
      }));

      expect([auth.status, storage.status]).toEqual([200, 201]);
      expect(received).toEqual([
        { method: 'GET', url: '/auth/v1/health', authorization: undefined, body: '' },
        {
          method: 'POST',
          url: '/storage/v1/object/media-staging/path',
          authorization: 'Bearer local-token',
          body: 'jpeg-fixture',
        },
      ]);
    } finally {
      await server.close();
    }
  });
});
