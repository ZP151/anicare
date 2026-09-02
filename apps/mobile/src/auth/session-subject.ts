import { getSupabaseClient } from '../api/supabase';

export async function readSessionSubjectStrict(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

export function subscribeSessionSubject(onChange: (subject: string | null) => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}
