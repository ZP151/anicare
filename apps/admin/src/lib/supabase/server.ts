import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { getAdminPublicSupabaseConfig, getAdminServiceSupabaseConfig } from './config';

export type AdminServerClient = ReturnType<typeof createServerClient>;
export type AdminServiceClient = ReturnType<typeof createClient>;

export function createAdminServiceClient(): AdminServiceClient | null {
  const config = getAdminServiceSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createAdminServerClient(): Promise<AdminServerClient | null> {
  const config = getAdminPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
    },
  });
}

export async function createWritableAdminServerClient(): Promise<AdminServerClient | null> {
  const config = getAdminPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
