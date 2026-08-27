export type PublicSupabaseConfig = Readonly<{ url: string; key: string }>;

type Environment = Readonly<Record<string, string | undefined>>;

function validHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
      ? url
      : null;
  } catch {
    return null;
  }
}

export function getAdminPublicSupabaseConfig(environment: Environment = process.env): PublicSupabaseConfig | null {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || !validHttpUrl(url)) return null;
  return { url, key };
}

export function getAdminAppUrl(environment: Environment = process.env): string | null {
  const configured = environment.ADMIN_APP_URL?.trim();
  if (!configured) return null;
  const url = validHttpUrl(configured);
  if (!url || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
  return url.origin;
}
