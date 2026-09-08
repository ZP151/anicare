import 'server-only';

import type { AdminSessionClient } from './admin-session';

export type IdentityReviewerSession =
  | Readonly<{ state: 'unavailable' }>
  | Readonly<{ state: 'unauthenticated' }>
  | Readonly<{ state: 'unauthorised' }>
  | Readonly<{ state: 'authorised'; userId: string; client: AdminSessionClient }>;

function userIdFrom(result: unknown): string | null | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const outer = result as Record<string, unknown>;
  if (Object.keys(outer).length !== 2 || outer.error !== null || !outer.data || typeof outer.data !== 'object' || Array.isArray(outer.data)) return undefined;
  const data = outer.data as Record<string, unknown>;
  if (Object.keys(data).length !== 1 || !Object.hasOwn(data, 'user')) return undefined;
  if (data.user === null) return null;
  if (!data.user || typeof data.user !== 'object' || Array.isArray(data.user)) return undefined;
  const user = data.user as Record<string, unknown>;
  return typeof user.id === 'string' && user.id ? user.id : undefined;
}

export async function getIdentityReviewerSession(
  createClient: () => Promise<AdminSessionClient | null>,
): Promise<IdentityReviewerSession> {
  let client: AdminSessionClient | null;
  try { client = await createClient(); } catch { return { state: 'unavailable' }; }
  if (!client) return { state: 'unavailable' };
  let user: string | null | undefined;
  try { user = userIdFrom(await client.auth.getUser()); } catch { return { state: 'unavailable' }; }
  if (user === undefined) return { state: 'unavailable' };
  if (user === null) return { state: 'unauthenticated' };
  let capability: { data: unknown; error: unknown };
  try { capability = await client.rpc('identity_has_active_reviewer'); } catch { return { state: 'unavailable' }; }
  if (!capability || capability.error || typeof capability.data !== 'boolean') return { state: 'unavailable' };
  if (!capability.data) return { state: 'unauthorised' };
  return { state: 'authorised', userId: user, client };
}
