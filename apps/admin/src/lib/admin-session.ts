import 'server-only';

export interface AdminSessionClient {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  rpc(functionName: string): Promise<{ data: unknown; error: unknown }>;
}

export type AdminSession =
  | Readonly<{ state: 'unavailable' }>
  | Readonly<{ state: 'unauthenticated' }>
  | Readonly<{ state: 'unauthorised' }>
  | Readonly<{ state: 'authorised'; userId: string; client: AdminSessionClient }>;

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

  let userResult: { data: { user: { id: string } | null }; error: unknown };
  try {
    userResult = await client.auth.getUser();
    if (!userResult || !userResult.data) return { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }
  const { data, error } = userResult;
  if (error) return { state: 'unavailable' };
  if (!data.user) return { state: 'unauthenticated' };
  if (typeof data.user.id !== 'string' || !data.user.id) return { state: 'unavailable' };

  let grant: { data: unknown; error: unknown };
  try {
    grant = await client.rpc('admin_has_active_platform_admin');
    if (!grant) return { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }
  if (grant.error || typeof grant.data !== 'boolean') return { state: 'unavailable' };
  if (grant.data === false) return { state: 'unauthorised' };

  return { state: 'authorised', userId: data.user.id, client };
}
