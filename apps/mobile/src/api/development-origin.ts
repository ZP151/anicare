const APPROVED_LOCAL_SUPABASE_ORIGINS = new Set([
  'http://localhost:54321',
  'http://127.0.0.1:54321',
  'http://10.0.2.2:54321',
]);

export function developmentInsecureOrigins(supabaseUrl: string, production: boolean): readonly string[] {
  return !production && APPROVED_LOCAL_SUPABASE_ORIGINS.has(supabaseUrl) ? [supabaseUrl] : [];
}
