function equalSecret(value: string | null, expected: string | undefined): boolean {
  if (!value || !expected || value.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export async function authorizeCleanupRequest(request: Request, serviceKey: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([^\s]{1,8192})$/)?.[1] ?? null;
  if (equalSecret(bearer, serviceKey)) return true;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const issued = request.headers.get('x-cleanup-time') ?? '';
  const nonce = request.headers.get('x-cleanup-nonce') ?? '';
  const signature = request.headers.get('x-cleanup-signature') ?? '';
  if (!/^[0-9]{10}$/.test(issued) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const age = now / 1000 - Number(issued);
  if (age < -30 || age > 300) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!.map(byte => parseInt(byte,16)));
  return crypto.subtle.verify('HMAC',key,bytes,encoder.encode(`animalhelper-community-media-cleanup-v1\n${issued}\n${nonce}\n{}`));
}

/** No caller-selected targets. pg_net sends exactly two JSON bytes. */
export async function validCleanupBody(request: Request): Promise<boolean> {
  const contentType = request.headers.get('content-type');
  if (contentType !== null && contentType !== 'application/json') return false;
  const reader = request.body?.getReader();
  const bytes: number[] = [];
  if (reader) {
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        if (bytes.length + value.length > 2) { await reader.cancel(); return false; }
        bytes.push(...value);
      }
    } catch { return false; } finally { reader.releaseLock(); }
  }
  return contentType === null ? bytes.length === 0 : bytes.length === 2 && bytes[0] === 123 && bytes[1] === 125;
}
