import 'server-only';

export interface AdminSessionClient {
  auth: {
    getUser(): Promise<unknown>;
  };
  rpc(functionName: string): Promise<{ data: unknown; error: unknown }>;
}

export type AdminSession =
  | Readonly<{ state: 'unavailable' }>
  | Readonly<{ state: 'unauthenticated' }>
  | Readonly<{ state: 'unauthorised' }>
  | Readonly<{ state: 'authorised'; userId: string; client: AdminSessionClient }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function getValidatedUserId(result: unknown): string | null | undefined {
  if (!isPlainObject(result) || !hasExactKeys(result, ['data', 'error']) || result.error !== null) return undefined;
  if (!isPlainObject(result.data) || !hasExactKeys(result.data, ['user'])) return undefined;
  if (result.data.user === null) return null;
  if (!isPlainObject(result.data.user) || !hasOwn(result.data.user, 'id') || typeof result.data.user.id !== 'string' || !result.data.user.id) return undefined;
  return result.data.user.id;
}

export async function getAdminSession(
  createClient: () => Promise<AdminSessionClient | null>,
): Promise<AdminSession> {
  let client: AdminSessionClient | null;
  try {
    client = await createClient();
  } catch {
    return { state: 'unavailable' };
  }
  if (!client) return { state: 'unavailable' };

  let userResult: unknown;
  try {
    userResult = await client.auth.getUser();
  } catch {
    return { state: 'unavailable' };
  }
  const userId = getValidatedUserId(userResult);
  if (userId === undefined) return { state: 'unavailable' };
  if (userId === null) return { state: 'unauthenticated' };

  let grant: { data: unknown; error: unknown };
  try {
    grant = await client.rpc('admin_has_active_platform_admin');
    if (!grant) return { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }
  if (grant.error || typeof grant.data !== 'boolean') return { state: 'unavailable' };
  if (grant.data === false) return { state: 'unauthorised' };

  return { state: 'authorised', userId, client };
}
