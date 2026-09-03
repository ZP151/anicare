const DENIED = new Set([400, 401, 403, 404, 406]);
const MAX_ERROR_BYTES = 2_048;

export type StorageDeniedFailure = Readonly<{
  status: number;
  code: 'not_found' | 'unauthorized' | 'forbidden';
}>;

function normalizedCode(value: unknown): StorageDeniedFailure['code'] | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64) return null;
  const code = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (['not_found', 'notfound', 'no_such_key', 'nosuchkey', 'object_not_found'].includes(code)) return 'not_found';
  if (['unauthorized', 'not_authorized'].includes(code)) return 'unauthorized';
  if (['forbidden', 'access_denied', 'accessdenied'].includes(code)) return 'forbidden';
  return null;
}

async function boundedBody(response: Response): Promise<string | null> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_ERROR_BYTES)) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ERROR_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function readDeniedStorageFailure(response: Response): Promise<StorageDeniedFailure | null> {
  if (!DENIED.has(response.status) || response.redirected) return null;
  const source = await boundedBody(response);
  if (source === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const code = normalizedCode(record.code ?? record.error);
  return code === null ? null : { status: response.status, code };
}

export function sameDeniedStorageFailure(
  actual: StorageDeniedFailure | null,
  unknown: StorageDeniedFailure | null,
): boolean {
  return actual !== null && unknown !== null && actual.status === unknown.status && actual.code === unknown.code;
}
