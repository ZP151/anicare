import { listMyReports, parseMyReports, type NarrowRpcClient } from './my-reports';

const safeRow = {
  sightingId: '00000000-0000-4000-8000-000000002001',
  occurredAt: '2026-08-31T08:00:00.000Z',
  createdAt: '2026-08-31T09:00:00.000Z',
  reportState: 'private_review',
  mediaState: 'none',
  identityState: 'not_requested',
} as const;

function rpcClient(result: unknown, error: unknown = null): NarrowRpcClient {
  return { rpc: jest.fn().mockResolvedValue({ data: result, error }) };
}

describe('parseMyReports', () => {
  it('returns an exact bounded projection and derives the cursor from the final row', () => {
    expect(parseMyReports([safeRow])).toEqual({
      items: [safeRow],
      nextCursor: { createdAt: safeRow.createdAt, sightingId: safeRow.sightingId },
    });
  });

  it.each([
    ['more than 50 rows', Array.from({ length: 51 }, () => safeRow)],
    ['an unexpected field', [{ ...safeRow, extra: true }]],
    ['a public cell', [{ ...safeRow, publicCellId: '89652636d87ffff' }]],
    ['reporter data', [{ ...safeRow, reporterId: '00000000-0000-4000-8000-000000002002' }]],
    ['review notes', [{ ...safeRow, notes: 'private' }]],
    ['AI candidate data', [{ ...safeRow, confidence: 'likely' }]],
    ['an invalid UUID', [{ ...safeRow, sightingId: 'not-a-uuid' }]],
    ['an invalid timestamp', [{ ...safeRow, createdAt: '2026-02-30T09:00:00.000Z' }]],
    ['an invalid report enum', [{ ...safeRow, reportState: 'limited' }]],
    ['an invalid media enum', [{ ...safeRow, mediaState: 'finalized' }]],
    ['an invalid identity enum', [{ ...safeRow, identityState: 'confirmed' }]],
    ['a payload over 64 KiB', [{ ...safeRow, padding: 'x'.repeat(64 * 1024) }]],
  ])('rejects %s', (_name, value) => {
    expect(() => parseMyReports(value)).toThrow('invalid_my_reports_response');
  });
});

describe('listMyReports', () => {
  it('sends a bounded keyset cursor and does not expose RPC arguments beyond the narrow projection', async () => {
    const client = rpcClient([safeRow]);
    await expect(listMyReports({
      limit: 999,
      cursor: { createdAt: '2026-08-30T09:00:00.000Z', sightingId: '00000000-0000-4000-8000-000000002000' },
    }, client)).resolves.toEqual({
      items: [safeRow],
      nextCursor: { createdAt: safeRow.createdAt, sightingId: safeRow.sightingId },
    });
    expect(client.rpc).toHaveBeenCalledWith('list_my_sighting_summaries', {
      p_limit: 50,
      p_before_created_at: '2026-08-30T09:00:00.000Z',
      p_before_sighting_id: '00000000-0000-4000-8000-000000002000',
    });
  });

  it('clamps a low page request and uses null for both first-page cursor values', async () => {
    const client = rpcClient([]);
    await expect(listMyReports({ limit: 0 }, client)).resolves.toEqual({ items: [], nextCursor: null });
    expect(client.rpc).toHaveBeenCalledWith('list_my_sighting_summaries', {
      p_limit: 1,
      p_before_created_at: null,
      p_before_sighting_id: null,
    });
  });

  it('maps RPC failures to an unavailable error without returning partial rows', async () => {
    const client = rpcClient([safeRow], { message: 'permission denied' });
    await expect(listMyReports(undefined, client)).rejects.toThrow('my_reports_unavailable');
  });
});
