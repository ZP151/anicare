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
  const client = await createClient();
  if (!client) return { state: 'unavailable' };

  const { data, error } = await client.auth.getUser();
  if (error || !data.user || typeof data.user.id !== 'string') return { state: 'unauthenticated' };

  const grant = await client.rpc('admin_has_active_platform_admin');
  if (grant.error || grant.data !== true) return { state: 'unauthorised' };

  return { state: 'authorised', userId: data.user.id, client };
}
