import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export type AdminServerClient = ReturnType<typeof createServerClient>;

type PublicSupabaseConfig = Readonly<{
  url: string;
  key: string;
}>;

function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export async function createAdminServerClient(): Promise<AdminServerClient | null> {
  const config = getPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can read cookies but cannot set them. Route handlers
          // and Server Actions use this same client where writes are permitted.
        }
      },
    },
  });
}
